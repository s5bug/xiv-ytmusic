using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.IO.Pipes;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading;
using System.Threading.Tasks;
using Dalamud.Plugin.Services;
using NetMQ;
using NetMQ.Sockets;

namespace YtMusicPlugin;

public class YtMusicState : IDisposable {
    private const int Port = 26482;
    private PairSocket Connection { get; init; }
    private NetMQPoller Poller { get; init; }
    private NetMQQueue<byte[]> Outgoing { get; init;  }
    
    private Dictionary<string, TaskCompletionSource<JsonObject>> RpcCalls { get; init; }
    
    private Dictionary<string, RpcObservable> RpcStreams { get; init; }

    public YtMusicState() {
        Connection = new PairSocket($">tcp://localhost:{Port}");
        Outgoing = new NetMQQueue<byte[]>();
        Poller = new NetMQPoller();
        
        RpcCalls = new Dictionary<string, TaskCompletionSource<JsonObject>>();
        RpcStreams = new Dictionary<string, RpcObservable>();

        Outgoing.ReceiveReady += (s, a) => {
            while (Outgoing.TryDequeue(out byte[] bytes, TimeSpan.Zero)) {
                Connection.SendFrame(bytes);
            }
        };

        Connection.ReceiveReady += (s, a) => {
            while (Connection.TryReceiveFrameBytes(out byte[] bytes)) {
                string str = Encoding.UTF8.GetString(bytes);
                JsonObject obj = JsonNode.Parse(str)!.AsObject();

                obj["tx_id"].AsValue().TryGetValue(out string txId);

                if (RpcStreams.TryGetValue(txId, out var observable)) {
                    observable.Handle(obj);
                }

                if (RpcCalls.Remove(txId, out var tcs)) {
                    tcs.SetResult(obj);
                }
            }
        };
        
        Poller.Add(Connection);
        Poller.Add(Outgoing);
        Poller.RunAsync();

        volumeObservable = ObserveVolume();
        playerStateObservable = ObservePlayerState();
    }

    private MappedRpcObservable<int> volumeObservable;
    public IObservable<int> Volume => volumeObservable;
    private MappedRpcObservable<PlayerState> playerStateObservable;
    public IObservable<PlayerState> PlayerState => playerStateObservable;

    private static string GenerateTxId() {
        return Guid.NewGuid().ToString();
    }

    private static JsonObject GenerateEmptyObj() {
        return JsonNode.Parse("{}")!.AsObject();
    }

    private void SendJson(JsonObject obj) {
        string line;
        using(var stream = new MemoryStream()) {
            Utf8JsonWriter writer = new Utf8JsonWriter(stream, new JsonWriterOptions { Indented = true });
            obj.WriteTo(writer);
            writer.Flush();
            line = Encoding.UTF8.GetString(stream.ToArray());
        }
        
        byte[] bytes = Encoding.UTF8.GetBytes(line);

        Outgoing.Enqueue(bytes);
    }
    
    private async Task<JsonObject> RpcRequest(JsonObject requestWithoutTxId) {
        TaskCompletionSource<JsonObject> tcs = new TaskCompletionSource<JsonObject>();
        string txId = GenerateTxId();
        requestWithoutTxId["tx_id"] = txId;

        RpcCalls[txId] = tcs;

        SendJson(requestWithoutTxId);

        // TODO properly handle correct ACK message
        return await tcs.Task;
    }

    private RpcObservable RpcStream(JsonObject requestWithoutTxId, string unsubscribeType) {
        string txId = GenerateTxId();
        requestWithoutTxId["tx_id"] = txId;
        
        RpcObservable obs = new(() => {
            JsonObject unsubMsg = GenerateEmptyObj();
            unsubMsg["tx_id"] = txId;
            unsubMsg["msg_type"] = unsubscribeType;
            SendJson(unsubMsg);
        });

        RpcStreams[txId] = obs;

        // for observables we want fire-and-forget
        SendJson(requestWithoutTxId);

        return obs;
    }

    public Task<NowPlayingData> GetNowPlayingData() {
        var obj = GenerateEmptyObj();
        obj["msg_type"] = "now_playing";
        return RpcRequest(obj).ContinueWith(t => {
            t.Result["title"].AsValue().TryGetValue(out string title);
            t.Result["author"].AsValue().TryGetValue(out string author);
            t.Result["thumbnail_url"].AsValue().TryGetValue(out string thumbnailUrl);
            t.Result["cover_url"].AsValue().TryGetValue(out string coverUrl);
            return new NowPlayingData(title, author, thumbnailUrl, coverUrl);
        });
    }
    
    public Task<int> GetVolume() {
        var obj = GenerateEmptyObj();
        obj["msg_type"] = "get_volume";
        return RpcRequest(obj).ContinueWith(t => {
            t.Result["volume"].AsValue().TryGetValue(out int value);
            return value;
        });
    }

    public Task SetVolume(int v) {
        var obj = GenerateEmptyObj();
        obj["msg_type"] = "set_volume";
        obj["volume"] = v;
        return RpcRequest(obj);
    }

    private MappedRpcObservable<int> ObserveVolume() {
        var obj = GenerateEmptyObj();
        obj["msg_type"] = "subscribe_volume";
        return new MappedRpcObservable<int>(RpcStream(obj, "unsubscribe_volume"), t => {
            t["volume"].AsValue().TryGetValue(out int value);
            return value;
        });
    }

    private MappedRpcObservable<PlayerState> ObservePlayerState() {
        var obj = GenerateEmptyObj();
        obj["msg_type"] = "subscribe_player_state";
        return new MappedRpcObservable<PlayerState>(RpcStream(obj, "unsubscribe_player_state"), t => {
            t["state"].AsValue().TryGetValue(out string value);
            return value switch {
                "unstarted" => YtMusicPlugin.PlayerState.Unstarted,
                "ended" => YtMusicPlugin.PlayerState.Ended,
                "playing" => YtMusicPlugin.PlayerState.Playing,
                "paused" => YtMusicPlugin.PlayerState.Paused,
                "buffering" => YtMusicPlugin.PlayerState.Buffering,
                "video queued" => YtMusicPlugin.PlayerState.VideoQueued
            };
        });
    }

    public Task SetPlay() {
        var obj = GenerateEmptyObj();
        obj["msg_type"] = "play";
        return RpcRequest(obj);
    }

    public Task SetPause() {
        var obj = GenerateEmptyObj();
        obj["msg_type"] = "pause";
        return RpcRequest(obj);
    }

    public Task SetNext() {
        var obj = GenerateEmptyObj();
        obj["msg_type"] = "next";
        return RpcRequest(obj);
    }

    public Task SetPrevious() {
        var obj = GenerateEmptyObj();
        obj["msg_type"] = "previous";
        return RpcRequest(obj);
    }

    public void Dispose() {
        volumeObservable.Dispose();
        playerStateObservable.Dispose();

        Poller.Dispose();
        Outgoing.Dispose();
        Connection.Dispose();
    }
}

public record MappedRpcObservable<T>(RpcObservable Self, Func<JsonObject, T> Converter) : IObservable<T>, IDisposable {
    public record MappedObserver(IObserver<T> Self, Func<JsonObject, T> Converter) : IObserver<JsonObject> {
        public void OnCompleted() {
            Self.OnCompleted();
        }

        public void OnError(Exception error) {
            Self.OnError(error);
        }

        public void OnNext(JsonObject value) {
            Self.OnNext(Converter(value));
        }
    }
    
    public IDisposable Subscribe(IObserver<T> observer) {
        return Self.Subscribe(new MappedObserver(observer, Converter));
    }

    public void Dispose() => Self.Dispose();
}

public class RpcObservable : IObservable<JsonObject>, IDisposable {
    private JsonObject? MostRecent { get; set; }
    private List<IObserver<JsonObject>> Observers { get; init; }
    private Action Unsubscribe { get; init; }

    public RpcObservable(Action unsubscribe) {
        MostRecent = null;
        Observers = new List<IObserver<JsonObject>>();
        Unsubscribe = unsubscribe;
    }

    private record Unsubscriber(RpcObservable Outer, IObserver<JsonObject> Self) : IDisposable {
        public void Dispose() {
            lock (Outer.Observers) {
                Outer.Observers.Remove(Self);
            }
        }
    }
    
    public IDisposable Subscribe(IObserver<JsonObject> observer) {
        lock (Observers) {
            if (MostRecent != null) {
                observer.OnNext(MostRecent);
            }
            Observers.Add(observer);
        }
        return new Unsubscriber(this, observer);
    }

    public void Handle(JsonObject message) {
        lock (Observers) {
            MostRecent = message;
            Observers.ForEach(o => o.OnNext(message));
        }
    }

    public void Dispose() {
        Unsubscribe();
        lock (Observers) {
            MostRecent = null;
            Observers.ForEach(o => o.OnCompleted());
            Observers.Clear();
        }
    }
}

public enum PlayerState {
    Unstarted = -1,
    Ended = 0,
    Playing = 1,
    Paused = 2,
    Buffering = 3,
    VideoQueued = 5
}

public record NowPlayingData(string Title, string Author, string ThumbnailUrl, string CoverUrl);
