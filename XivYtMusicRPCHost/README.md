﻿# XivYtMusicRPCHost

this process is spawned by Chrome Native Messaging, and all it does is relay messages via a named pipe to be consumed by
another client.

modify `XivYtMusicRPCHost.reg` to point to wherever you're storing the build artifacts.

modify `XivYtMusicRPCHostNMH.json` to allow whatever the extension's ID ends up being.

## TODO

- make this program actually exit when stdin/stdout are closed
