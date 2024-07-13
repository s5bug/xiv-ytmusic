using Dalamud.Game.Command;
using Dalamud.IoC;
using Dalamud.Plugin;
using System.IO;
using Dalamud.Interface.Windowing;
using Dalamud.Plugin.Services;
using NetMQ;
using YtMusicPlugin.Windows;

namespace YtMusicPlugin;

public sealed class Plugin : IDalamudPlugin {
    private const string YtmCommand = "/ytm";

    private IDalamudPluginInterface PluginInterface { get; init; }
    private ICommandManager CommandManager { get; init; }
    public Configuration Configuration { get; init; }

    public readonly WindowSystem WindowSystem = new("YtMusicPlugin");
    private MainWindow MainWindow { get; init; }
    
    private NetMQPoller Poller { get; init; }
    public YtMusicState State { get; init; }

    public Plugin(
        IDalamudPluginInterface pluginInterface,
        ICommandManager commandManager,
        ITextureProvider textureProvider) {
        
        PluginInterface = pluginInterface;
        CommandManager = commandManager;

        Configuration = PluginInterface.GetPluginConfig() as Configuration ?? new Configuration();
        Configuration.Initialize(PluginInterface);

        Poller = new NetMQPoller();
        State = new YtMusicState(Poller);
        Poller.RunAsync();

        MainWindow = new MainWindow(this, textureProvider);

        WindowSystem.AddWindow(MainWindow);

        CommandManager.AddHandler(YtmCommand, new CommandInfo(OnCommand) {
            HelpMessage = "Open the YouTube Music window"
        });

        PluginInterface.UiBuilder.Draw += DrawUI;

        // Adds another button that is doing the same but for the main ui of the plugin
        PluginInterface.UiBuilder.OpenMainUi += ToggleMainUI;
    }

    public void Dispose() {
        WindowSystem.RemoveAllWindows();

        MainWindow.Dispose();
        State.Dispose();
        Poller.Dispose();

        CommandManager.RemoveHandler(YtmCommand);
    }

    private void OnCommand(string command, string args) {
        // in response to the slash command, just toggle the display status of our main ui
        ToggleMainUI();
    }

    private void DrawUI() => WindowSystem.Draw();

    public void ToggleMainUI() => MainWindow.Toggle();
}
