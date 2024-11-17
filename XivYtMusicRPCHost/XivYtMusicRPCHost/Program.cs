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
    while (!cts.IsCancellationRequested) {
        byte[] lengthPrefix = new byte[4];

        try {
            await stdin.ReadExactlyAsync(lengthPrefix.AsMemory(), cts.Token);
        }
        catch (EndOfStreamException) {
            _ = cts.CancelAsync();
            return;
        }
        catch (ObjectDisposedException) {
            _ = cts.CancelAsync();
            return;
        }

        uint length = BitConverter.ToUInt32(lengthPrefix);

        byte[] buffer = new byte[length];

        try {
            await stdin.ReadExactlyAsync(buffer.AsMemory(), cts.Token);
        }
        catch (EndOfStreamException) {
            _ = cts.CancelAsync();
            return;
        }
        catch (ObjectDisposedException) {
            _ = cts.CancelAsync();
            return;
        }

        writeDataTo.SendFrame(buffer);
    }
}

async Task WriteReadForever(CancellationTokenSource cts, PairSocket readDataFrom, Stream stdout) {
    while (!cts.IsCancellationRequested) {
        var (msg, _) = await readDataFrom.ReceiveFrameBytesAsync(cts.Token);

        byte[] lengthPrefix = BitConverter.GetBytes((uint) msg.Length);

        try {
            await stdout.WriteAsync(lengthPrefix.AsMemory(), cts.Token);
            await stdout.WriteAsync(msg.AsMemory(), cts.Token);
        }
        catch (ObjectDisposedException) {
            _ = cts.CancelAsync();
            return;
        }
    }
}
