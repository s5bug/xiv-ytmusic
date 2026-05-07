using System;
using System.Numerics;
using System.Threading;
using Dalamud.Bindings.ImGui;
using Dalamud.Interface.Utility.Raii;
using Dalamud.Interface.Windowing;

namespace YtMusicPlugin.Windows;

public class ConfigWindow : Window, IDisposable
{
    private readonly Configuration configuration;
    private readonly WebServer webServer;

    // We give this window a constant ID using ###.
    // This allows for labels to be dynamic, like "{FPS Counter}fps###XYZ counter window",
    // and the window ID will always be "###XYZ counter window" for ImGui
    public ConfigWindow(Plugin plugin) : base("A Wonderful Configuration Window###With a constant ID")
    {
        Flags = ImGuiWindowFlags.NoCollapse | ImGuiWindowFlags.NoScrollbar | ImGuiWindowFlags.NoScrollWithMouse;

        Size = new Vector2(232, 120);
        SizeCondition = ImGuiCond.Always;

        configuration = plugin.Configuration;
        webServer = plugin.WebServer;
    }

    public void Dispose() { }

    public override void PreDraw()
    {
        
    }

    public override void Draw()
    {
        var configValue = configuration.Port;
        if (ImGui.InputInt("Port", ref configValue))
        {
            configuration.Port = configValue;
            configuration.Save();
        }

        bool startEnabled = webServer.CanStart();
        using (ImRaii.Disabled(!startEnabled))
        {
            if (ImGui.Button("Start"))
            {
                webServer.Start();
            }
        }
        
        bool stopEnabled = webServer.CanStop();
        using (ImRaii.Disabled(!stopEnabled))
        {
            if (ImGui.Button("Stop"))
            {
                webServer.Stop();
            }
        }
    }
}
