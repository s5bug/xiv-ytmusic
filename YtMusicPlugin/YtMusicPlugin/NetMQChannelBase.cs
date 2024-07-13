using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading;
using System.Threading.Tasks;
using Google.Protobuf;
using Grpc.Core;
using NetMQ;
using NetMQ.Sockets;

namespace YtMusicPlugin;

public class NetMQChannelBase : ChannelBase {
    private readonly NetMQPoller poller;
    private readonly PairSocket connection;

    private readonly NetMQQueue<byte[]> outgoing;

    private readonly Dictionary<string, object> transactionHandlers;
    
    public NetMQChannelBase(string target, NetMQPoller poller) : base(target) {
        this.poller = poller;
        connection = new PairSocket(target);
        outgoing = new NetMQQueue<byte[]>();
        transactionHandlers = new Dictionary<string, object>();
        
        outgoing.ReceiveReady += (s, a) => {
            while (outgoing.TryDequeue(out var bytes, TimeSpan.Zero)) {
                connection.SendFrame(bytes!);
            }
        };

        connection.ReceiveReady += (s, a) => {
            while (connection.TryReceiveFrameBytes(out var bytes)) {
                string str = Encoding.UTF8.GetString(bytes);
                JsonObject obj = JsonNode.Parse(str)!.AsObject();

                obj["tx_id"].AsValue().TryGetValue(out string txId);

                // gRPC limitation :/
                string messageJson;
                using (var stream = new MemoryStream()) {
                    Utf8JsonWriter writer = new Utf8JsonWriter(stream);
                    obj["message"].AsObject().WriteTo(writer);
                    writer.Flush();
                    messageJson = Encoding.UTF8.GetString(stream.ToArray());
                }

                if (transactionHandlers.TryGetValue(txId, out var handler)) {
                    // waiting for C# to get wildcards
                    if (handler.GetType().GetGenericTypeDefinition() == typeof(TaskCompletionSource<>)) {
                        var tyT = handler.GetType().GenericTypeArguments[0];
                        var genericParse =
                            typeof(JsonParser).GetMethods()
                                              .Single(m => m is {
                                                  Name: "Parse",
                                                  IsGenericMethod: true,
                                                  ReturnType.IsGenericMethodParameter: true,
                                              } && m.GetParameters()[0].ParameterType == typeof(string));
                        object resultObject =
                            genericParse.MakeGenericMethod([tyT]).Invoke(JsonParser.Default, [messageJson])!;
                        handler.GetType().InvokeMember(
                            "SetResult",
                            BindingFlags.InvokeMethod,
                            Type.DefaultBinder,
                            handler,
                            [resultObject]);
                    } else if
                        (handler.GetType().GetGenericTypeDefinition() ==
                         typeof(NetMQCallInvoker.ChannelStreamReader<>)) {
                        handler.GetType().InvokeMember(
                            "ReceiveJson",
                            BindingFlags.InvokeMethod,
                            Type.DefaultBinder,
                            handler,
                            [messageJson]);
                    } else {
                        throw new ArgumentException();
                    }
                }
            }
        };
        
        this.poller.Add(connection);
        this.poller.Add(outgoing);
    }

    protected override Task ShutdownAsyncCore() {
        foreach (var (k, v) in transactionHandlers) {
            if (v.GetType().GetGenericTypeDefinition() == typeof(TaskCompletionSource<>)) {
                v.GetType().InvokeMember(
                    "TrySetCanceled",
                    BindingFlags.InvokeMethod,
                    Type.DefaultBinder,
                    v,
                    []);
            } else if
                (v.GetType().GetGenericTypeDefinition() ==
                 typeof(NetMQCallInvoker.ChannelStreamReader<>)) {
                string unsub = $$"""{"tx_id":"{{k}}"}""";
                byte[] unsubUtf8 = Encoding.UTF8.GetBytes(unsub);
                // TODO ensure this has made it on the wire before completing disposal
                outgoing.Enqueue(unsubUtf8);
            } else {
                throw new ArgumentException();
            }
        }
        transactionHandlers.Clear();
        poller.RemoveAndDispose(outgoing);
        poller.RemoveAndDispose(connection);
        return Task.CompletedTask;
    }

    public override CallInvoker CreateCallInvoker() {
        return new NetMQCallInvoker(this);
    }

    public class NetMQCallInvoker(NetMQChannelBase outer) : CallInvoker {
        public override AsyncUnaryCall<TResponse> AsyncUnaryCall<TRequest, TResponse>(Method<TRequest, TResponse> method, string? host, CallOptions options, TRequest request) {
            if (request is not IMessage requestM) throw new ArgumentException("Request wasn't a message"); 
            
            string inner = JsonFormatter.Default.Format(requestM);
            string requestId = Guid.NewGuid().ToString();
            string methodName = method.FullName;
            string frame = $$"""{"message":{{inner}},"tx_id":"{{requestId}}","method":"{{methodName}}"}""";
            byte[] utf8 = Encoding.UTF8.GetBytes(frame);

            TaskCompletionSource<TResponse> tcs = new();
            outer.transactionHandlers.Add(requestId, tcs);
            
            outer.outgoing.Enqueue(utf8);

            return new AsyncUnaryCall<TResponse>(
                tcs.Task,
                Task.FromResult(Metadata.Empty),
                () => Status.DefaultSuccess,
                () => Metadata.Empty,
                () => {
                    outer.transactionHandlers.Remove(requestId);
                    _ = tcs.TrySetCanceled();
                }
            );
        }

        public class ChannelStreamReader<T> : IAsyncStreamReader<T> where T : class, IMessage, new() {
            public TaskCompletionSource<bool> Tcs { get; set; } = new();
            
            public async Task<bool> MoveNext(CancellationToken cancellationToken) {
                return await Tcs.Task.WaitAsync(cancellationToken);
            }

            public void ReceiveJson(string json) {
                Receive(JsonParser.Default.Parse<T>(json));
            }
            
            public void Receive(T next) {
                var old = Tcs;
                Tcs = new TaskCompletionSource<bool>();
                Current = next;
                old.SetResult(true);
            }

            public T Current { get; set; } = null;
        }
        
        public override AsyncServerStreamingCall<TResponse> AsyncServerStreamingCall<TRequest, TResponse>(
            Method<TRequest, TResponse> method, string? host, CallOptions options, TRequest request) {
            if (request is not IMessage requestM) throw new ArgumentException("Request wasn't a message"); 
            
            string inner = JsonFormatter.Default.Format(requestM);
            string requestId = Guid.NewGuid().ToString();
            string methodName = method.FullName;
            string frame = $$"""{"message":{{inner}},"tx_id":"{{requestId}}","method":"{{methodName}}"}""";
            byte[] utf8 = Encoding.UTF8.GetBytes(frame);

            // we have to do this because C# doesn't believe TResponse is an IMessage with a new()
            // TODO I think there's a better way to hack this, but I don't want to look through gRPC code right now
            object csr = typeof(ChannelStreamReader<>).MakeGenericType([typeof(TResponse)])
                                                      .GetConstructor([])!.Invoke([]);
            outer.transactionHandlers.Add(requestId, csr);
            
            outer.outgoing.Enqueue(utf8);

            return new AsyncServerStreamingCall<TResponse>(
                (IAsyncStreamReader<TResponse>) csr,
                Task.FromResult(Metadata.Empty),
                () => Status.DefaultSuccess,
                () => Metadata.Empty,
                () => {
                    string unsub = $$"""{"tx_id":"{{requestId}}"}""";
                    byte[] unsubUtf8 = Encoding.UTF8.GetBytes(unsub);
                    outer.outgoing.Enqueue(unsubUtf8);

                    outer.transactionHandlers.Remove(requestId);
                }
            );
        }
        
        // Not supported
        public override TResponse BlockingUnaryCall<TRequest, TResponse>(Method<TRequest, TResponse> method, string? host, CallOptions options, TRequest request) {
            throw new System.NotImplementedException();
        }

        public override AsyncClientStreamingCall<TRequest, TResponse> AsyncClientStreamingCall<TRequest, TResponse>(
            Method<TRequest, TResponse> method, string? host, CallOptions options) {
            throw new System.NotImplementedException();
        }

        public override AsyncDuplexStreamingCall<TRequest, TResponse> AsyncDuplexStreamingCall<TRequest, TResponse>(
            Method<TRequest, TResponse> method, string? host, CallOptions options) {
            throw new System.NotImplementedException();
        }
    }
}
