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
using Grpc.Core;
using NetMQ;
using NetMQ.Sockets;

namespace YtMusicPlugin;

public class YtMusicState : IDisposable {
    private const int Port = 26482;
    private NetMQChannelBase ChannelBase { get; init; }
    public YtMusic.YtMusicClient Client { get; init; }
    private NetMQPoller Poller { get; init; }

    public YtMusicState(NetMQPoller poller) {
        ChannelBase = new NetMQChannelBase($">tcp://localhost:{Port}", poller);
        Client = new YtMusic.YtMusicClient(ChannelBase);
        Poller = poller;
    }

    public void Dispose() {
        ChannelBase.ShutdownAsync();
    }
}
