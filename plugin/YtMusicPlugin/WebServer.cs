using System;
using System.Threading;
using System.Threading.Tasks;
using Grpc.Core;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Server.Kestrel.Core;
using Microsoft.Extensions.DependencyInjection;

namespace YtMusicPlugin;

public sealed class WebServer : IAsyncDisposable
{
    public enum Status
    {
        Running,
        Stopping,
        Stopped
    }

    private readonly Configuration configuration;
    private readonly YtMusicService service;
    private WebApplication? server;
    private Task? stoppingTask;
    
    public WebServer(Configuration configuration, YtMusicService service)
    {
        this.configuration = configuration;
        this.service = service;
    }

    private WebApplication MakeServer()
    {
        WebApplicationBuilder builder = WebApplication.CreateBuilder();

        builder.WebHost.ConfigureKestrel(options =>
        {
            options.ListenLocalhost(configuration.Port, listenOptions =>
            {
                listenOptions.Protocols = HttpProtocols.Http2;
            });
        });

        builder.Services.AddGrpc();
        builder.Services.AddSingleton(service);
        
        WebApplication newApp = builder.Build();
        newApp.MapGrpcService<YtMusicService>();
        return newApp;
    }

    public bool CanStart()
    {
        if (configuration.Port < 1025 || configuration.Port > 65535) return false;
        if (GetStatus() == Status.Running || GetStatus() == Status.Stopping) return false;

        return true;
    }

    public bool CanStop()
    {
        if (GetStatus() == Status.Running) return true;

        return false;
    }
    
    public Status GetStatus()
    {
        if (server is null) return Status.Stopped;
        if (stoppingTask is not null && !stoppingTask.IsCompleted) return Status.Stopping;
        return Status.Running;
    }

    public Task Start(CancellationToken cancellationToken = default)
    {
        if(!CanStart()) return Task.CompletedTask;
        server = MakeServer();
        return server.StartAsync(cancellationToken);
    }

    public void Stop(CancellationToken cancellationToken = default)
    {
        if(!CanStop()) return;
        stoppingTask = ShutdownTask(cancellationToken);
    }

    private async Task ShutdownTask(CancellationToken cancellationToken)
    {
        await server!.StopAsync(cancellationToken);
        await server.DisposeAsync();
        server = null;
        stoppingTask = null;
    }

    public async ValueTask DisposeAsync()
    {
        if (GetStatus() == Status.Stopped) return;
        // we know server is non-null here because status isn't stopped
        if (stoppingTask is not null) await stoppingTask;
        else await ShutdownTask(CancellationToken.None);
    }
}
