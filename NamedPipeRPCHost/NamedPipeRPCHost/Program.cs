using System.IO.Pipes;

const string pipeName = @"ytmusic-xiv-rpc";

await using NamedPipeServerStream server = new(pipeName, PipeDirection.InOut, 1, PipeTransmissionMode.Byte, PipeOptions.Asynchronous);
await server.WaitForConnectionAsync();

using CancellationTokenSource cts = new();

// TODO: if the named pipe errors, just loop, but if stdin/stdout close, exit

await Task.WhenAll(
    ReadWriteForever(cts, server),
    WriteReadForever(cts, server)
);

return;

async Task ReadWriteForever(CancellationTokenSource cts, NamedPipeServerStream writeDataTo) {
    await using (Stream stdin = Console.OpenStandardInput()) {
        byte[] chunk = new byte[4096];
        while (true) {
            int count = await stdin.ReadAtLeastAsync(chunk, 1, false, cts.Token);
            if (count == 0) {
                await cts.CancelAsync();
                return;
            }
            // We don't want this to cancel mid-way
            await writeDataTo.WriteAsync(chunk.AsMemory(0, count));
        }
    }
}

async Task WriteReadForever(CancellationTokenSource cts, NamedPipeServerStream readDataFrom) {
    await using (Stream stdout = Console.OpenStandardOutput()) {
        byte[] chunk = new byte[4096];
        while (true) {
            int count = await readDataFrom.ReadAtLeastAsync(chunk, 1, false, cts.Token);
            if (count == 0) {
                await cts.CancelAsync();
                return;
            }
            await stdout.WriteAsync(chunk.AsMemory(0, count), cts.Token);
        }
    }
}
