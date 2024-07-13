using NetMQ;
using NetMQ.Sockets;

const int port = 26482;

using (var runtime = new NetMQRuntime()) {
    runtime.Run(Server());
}

return;

async Task Server() {
    await using var stdin = Console.OpenStandardInput();
    await using var stdout = Console.OpenStandardOutput();
    using var server = new PairSocket($"@tcp://localhost:{port}");
    
    using CancellationTokenSource cts = new();

    // if stdin/stdout close, exit
    Task rwTask = ReadWriteForever(cts, server, stdin);
    Task wrTask = WriteReadForever(cts, server, stdout);

    await Task.WhenAll(
        rwTask,
        wrTask
    );
}

async Task ReadWriteForever(CancellationTokenSource cts, PairSocket writeDataTo, Stream stdin) {
    while (true) {
        byte[] lengthPrefix = new byte[4];
        await stdin.ReadExactlyAsync(lengthPrefix.AsMemory(), cts.Token);
        uint length = BitConverter.ToUInt32(lengthPrefix);

        byte[] buffer = new byte[length];
        await stdin.ReadExactlyAsync(buffer.AsMemory(), cts.Token);

        writeDataTo.SendFrame(buffer);
    }
}

async Task WriteReadForever(CancellationTokenSource cts, PairSocket readDataFrom, Stream stdout) {
    while (true) {
        var (msg, _) = await readDataFrom.ReceiveFrameBytesAsync(cts.Token);

        byte[] lengthPrefix = BitConverter.GetBytes((uint) msg.Length);
        await stdout.WriteAsync(lengthPrefix.AsMemory());
        await stdout.WriteAsync(msg.AsMemory());
    }
}
