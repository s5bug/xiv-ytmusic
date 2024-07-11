using System.IO.Pipes;

const string pipeName = @"ytmusic-xiv-rpc";

Task<bool> rwTask;
Task<bool> wrTask;

do {
    await using NamedPipeServerStream server = new(pipeName, PipeDirection.InOut, 1, PipeTransmissionMode.Byte, PipeOptions.Asynchronous);
    await server.WaitForConnectionAsync();

    using CancellationTokenSource cts = new();

    // if the named pipe errors, just loop, but if stdin/stdout close, exit
    rwTask = ReadWriteForever(cts, server);
    wrTask = WriteReadForever(cts, server);

    await Task.WhenAll(
        rwTask,
        wrTask
    );
} while (rwTask.Result || wrTask.Result);

return;

async Task<bool> ReadWriteForever(CancellationTokenSource cts, NamedPipeServerStream writeDataTo) {
    await using (Stream stdin = Console.OpenStandardInput()) {
        byte[] chunk = new byte[4096];
        while (true) {
            int count;
            try {
                count = await stdin.ReadAtLeastAsync(chunk, 1, false, cts.Token);
            } catch (ObjectDisposedException ojde) {
                return false;
            }

            if (count == 0) {
                await cts.CancelAsync();
                // stdin/stdout closed, so we shouldn't retry
                return false;
            }
            
            try {
                // We don't want the write to the named pipe to cancel mid-way
                await writeDataTo.WriteAsync(chunk.AsMemory(0, count));
            } catch (IOException ioe) {
                // error writing to named pipe so we should retry
                return true;
            } catch (ObjectDisposedException ojde) {
                // the named pipe was disposed so we should retry
                return true;
            }
        }
    }
}

async Task<bool> WriteReadForever(CancellationTokenSource cts, NamedPipeServerStream readDataFrom) {
    await using (Stream stdout = Console.OpenStandardOutput()) {
        byte[] chunk = new byte[4096];
        while (true) {
            int count;
            try {
                count = await readDataFrom.ReadAtLeastAsync(chunk, 1, false, cts.Token);
            } catch (IOException ioe) {
                // error reading from named pipe so we should retry
                return true;
            } catch (ObjectDisposedException ojde) {
                // the named pipe was disposed so we should retry
                return true;
            }

            if (count == 0) {
                // EOF on named pipe so we should retry
                await cts.CancelAsync();
                return true;
            }

            try {
                await stdout.WriteAsync(chunk.AsMemory(0, count), cts.Token);
            } catch (ObjectDisposedException ojde) {
                return false;
            }
        }
    }
}
