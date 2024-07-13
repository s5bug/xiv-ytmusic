using System;
using System.Net;
using System.Net.Http;
using System.Numerics;
using System.Runtime.Caching;
using System.Threading.Tasks;
using Dalamud.Interface;
using Dalamud.Interface.Internal;
using Dalamud.Interface.Textures.TextureWraps;
using Dalamud.Interface.Utility;
using Dalamud.Interface.Utility.Raii;
using Dalamud.Interface.Windowing;
using Dalamud.Plugin.Services;
using Dalamud.Utility.Numerics;
using Google.Protobuf.WellKnownTypes;
using Grpc.Core;
using ImGuiNET;

namespace YtMusicPlugin.Windows;

public class MainWindow : Window, IDisposable {
    private readonly Plugin plugin;
    private readonly HttpClient httpClient;
    private readonly ITextureProvider textureProvider;
    private readonly MemoryCache urlTextureCache;

    private readonly AsyncServerStreamingCall<PlayerStateMsg> playerStateSubscription;
    private readonly AsyncServerStreamingCall<VolumeMsg> volumeSubscription;
    private readonly AsyncServerStreamingCall<NowPlayingMsg> nowPlayingSubscription;

    public MainWindow(Plugin plugin, ITextureProvider textureProvider)
        : base(
            "YouTube Music##ytm main window", 
            ImGuiWindowFlags.NoScrollbar | ImGuiWindowFlags.NoScrollWithMouse | ImGuiWindowFlags.NoResize) {
        SizeConstraints = new WindowSizeConstraints {
            MinimumSize = new Vector2(800, 400),
            MaximumSize = new Vector2(800, 400)
        };

        this.plugin = plugin;
        this.textureProvider = textureProvider;
        httpClient = new HttpClient();
        urlTextureCache = new MemoryCache("xivytmusic thumbnail texture cache");

        volumeSubscription = this.plugin.State.Client.Volume(new Empty());
        playerStateSubscription = this.plugin.State.Client.PlayerState(new Empty());
        nowPlayingSubscription = this.plugin.State.Client.NowPlaying(new Empty());
    }

    private static void RemovedCallback(CacheEntryRemovedArguments args) {
        var tw = args.CacheItem.Value as Task<IDalamudTextureWrap>;
    }

    private async Task<IDalamudTextureWrap> FetchNew(string url) {
        var stream = await httpClient.GetStreamAsync(url);
        return await textureProvider.CreateFromImageAsync(stream);
    }
    
    public IDalamudTextureWrap? GrabTexture(string url) {
        if (urlTextureCache.Get(url) is Task<IDalamudTextureWrap> tw) {
            return tw.Status == TaskStatus.RanToCompletion ? tw.Result : null;
        }

        urlTextureCache.Add(url, FetchNew(url), new CacheItemPolicy {
            RemovedCallback = RemovedCallback,
            SlidingExpiration = TimeSpan.FromMinutes(10)
        });
        return null;
    }
    
    public void Dispose() {
        volumeSubscription.Dispose();
        playerStateSubscription.Dispose();
        nowPlayingSubscription.Dispose();
        httpClient.Dispose();
        urlTextureCache.Dispose();
    }

    public override void Draw() {
        var framePaddingX = ImGui.GetStyle().FramePadding.X;
        var framePaddingY = ImGui.GetStyle().FramePadding.Y;
        
        var lineHeightSpacing = ImGui.GetTextLineHeightWithSpacing();
        var lineHeight = ImGui.GetTextLineHeight();

        var smallSongHeight = lineHeightSpacing + lineHeight;
        var smallSongCoverWidth = smallSongHeight;

        var bottomBarHeight = smallSongHeight + (2 * framePaddingY);
        var topSectionHeight = ImGui.GetContentRegionAvail().Y - bottomBarHeight - (2 * framePaddingY);
        var playlistWidth = ImGui.GetContentRegionAvail().X - topSectionHeight - (2 * framePaddingX);
        
        if (ImGui.BeginChild("cover_progress", new Vector2(topSectionHeight, topSectionHeight))) {
            this.DrawCoverProgress(lineHeightSpacing);
            ImGui.EndChild();
        }
        ImGui.SameLine();
        if (ImGui.BeginChild("playlist_tabs", new Vector2(playlistWidth, topSectionHeight))) {
            this.DrawPlaylistTabs();
            ImGui.EndChild();
        }

        if (ImGui.BeginChild("controls_box", new Vector2(ImGui.GetContentRegionAvail().X, bottomBarHeight))) {
            this.DrawControlsBox(smallSongHeight, lineHeightSpacing);
            ImGui.EndChild();
        }
    }
    
    public void DrawCoverProgress(float lineHeightSpacing) {
        float coverHeight = ImGui.GetContentRegionAvail().Y - lineHeightSpacing - (2 * ImGui.GetStyle().FramePadding.Y);
        float leftoverSpace = ImGui.GetContentRegionAvail().X - coverHeight;
        float offset = leftoverSpace / 2.0f;
        
        if (nowPlayingSubscription.ResponseStream.Current is { } nowPlayingMsg) {
            IDalamudTextureWrap? img = GrabTexture(nowPlayingMsg.CoverUrl);

            if (img is { } tw) {
                ImGui.SetCursorPosX(ImGui.GetCursorPosX() + offset);
                ImGui.Image(tw.ImGuiHandle, new Vector2(coverHeight, coverHeight));
            } else {
                using var font = ImRaii.PushFont(UiBuilder.IconFont);
                ImGui.Text(FontAwesomeIcon.QuestionCircle.ToIconString());
            }
        }
        
        ImGui.Text("0:30"); // TODO
        ImGui.SameLine();
        ImGui.SliderFloat("progress", ref dummy, 0.0f, 1.0f); // TODO
        ImGui.SameLine();
        ImGui.Text("1:00"); // TODO
    }
    
    private float dummy = 0.5f; // TODO

    public void DrawPlaylistTabs() {
        if (ImGui.BeginTabBar("playlist_tabs")) {
            if (ImGui.BeginTabItem("Up Next")) {
                ImGui.Text("playlist would go here"); // TODO
                ImGui.EndTabItem();
            }

            if (ImGui.BeginTabItem("Related")) {
                ImGui.Text("related would go here"); // TODO
                ImGui.EndTabItem();
            }
            ImGui.EndTabBar();
        }
    }
    
    public void DrawControlsBox(float smallSongHeight, float lineHeightSpacing) {
        if (ImGui.BeginTable("controls_table", 3, ImGuiTableFlags.SizingStretchSame, ImGui.GetContentRegionAvail())) {
            ImGui.TableNextRow();
            
            if (ImGui.TableNextColumn()) {
                using (var font = ImRaii.PushFont(UiBuilder.IconFont)) {
                    if (ImGui.Button(FontAwesomeIcon.StepBackward.ToIconString())) {
                        _ = plugin.State.Client.DoPreviousAsync(new Empty());
                    }

                    ImGui.SameLine();
                    switch (playerStateSubscription.ResponseStream.Current.State) {
                        case PlayerStateEnum.PsPlaying:
                        case PlayerStateEnum.PsBuffering:
                            if (ImGui.Button(FontAwesomeIcon.Pause.ToIconString())) {
                                _ = plugin.State.Client.DoPauseAsync(new Empty());
                            }

                            break;
                        case PlayerStateEnum.PsPaused:
                            if (ImGui.Button(FontAwesomeIcon.Play.ToIconString())) {
                                _ = plugin.State.Client.DoPlayAsync(new Empty());
                            }

                            break;
                        default:
                            if (ImGui.Button(FontAwesomeIcon.Question.ToIconString())) { }

                            break;
                    }

                    ImGui.SameLine();
                    if (ImGui.Button(FontAwesomeIcon.StepForward.ToIconString())) {
                        _ = plugin.State.Client.DoNextAsync(new Empty());
                    }
                }
            }

            if (ImGui.TableNextColumn()) {
                if (nowPlayingSubscription.ResponseStream.Current is { } nowPlayingMsg) {
                    if (ImGui.BeginChild("thumbnail", new Vector2(smallSongHeight, smallSongHeight))) {
                        IDalamudTextureWrap? img = GrabTexture(nowPlayingMsg.ThumbnailUrl);

                        if (img is { } tw) {
                            ImGui.Image(tw.ImGuiHandle, new Vector2(smallSongHeight, smallSongHeight));
                        } else {
                            using var font = ImRaii.PushFont(UiBuilder.IconFont);
                            ImGui.Text(FontAwesomeIcon.QuestionCircle.ToIconString());
                        }
                        
                        ImGui.EndChild();
                    }

                    ImGui.SameLine();
                    
                    var firstLine = ImGui.GetCursorPos();
                    ImGui.Text(nowPlayingMsg.Title);

                    var secondLine = firstLine.WithY(firstLine.Y + lineHeightSpacing);
                    ImGui.SetCursorPos(secondLine);
                    ImGui.Text(nowPlayingMsg.Author);
                }
            }

            if (ImGui.TableNextColumn()) {
                // TODO change icon based on volume state
                if (volumeSubscription.ResponseStream.Current is { } volumeMsg) {
                    int volumeToSend = (int) volumeMsg.Volume; // always 0-100 anyways so who cares
                    if (ImGui.SliderInt("##volumeSlider", ref volumeToSend, 0, 100)) {
                        var msg = new VolumeMsg();
                        msg.Volume = (uint)volumeToSend;
                        plugin.State.Client.SetVolumeAsync(msg);
                    }

                    ImGui.SameLine();
                    using var font = ImRaii.PushFont(UiBuilder.IconFont);
                    ImGui.Text(FontAwesomeIcon.VolumeUp.ToIconString());
                } else {
                    using var font = ImRaii.PushFont(UiBuilder.IconFont);
                    ImGui.Text(FontAwesomeIcon.VolumeOff.ToIconString());
                }
            }

            ImGui.EndTable();
        }
    }
}
