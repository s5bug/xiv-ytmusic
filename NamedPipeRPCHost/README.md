# NamedPipeRPCHost

this process is spawned by Chrome Native Messaging, and all it does is relay messages via a named pipe to be consumed by
another client.

modify `NamedPipeRPCHost.reg` to point to wherever you're storing the build artifacts.

modify `NamedPipeRPCHostNMH.json` to allow whatever the extension's ID ends up being.
