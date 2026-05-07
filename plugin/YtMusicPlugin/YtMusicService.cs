using System;
using System.Threading.Tasks;
using Google.Protobuf.WellKnownTypes;
using Grpc.Core;

namespace YtMusicPlugin;

public class YtMusicService : YtMusic.YtMusicBase
{
    public YtMusicState? State { get; private set; }
    
    public YtMusicService()
    {
        
    }
    
    public override Task Connect(IAsyncStreamReader<YtMusicToController> requestStream, IServerStreamWriter<ControllerToYtMusic> responseStream, ServerCallContext context)
    {
        return Task.Run(async () =>
        {
            if (this.State is null)
            {
                State = new YtMusicState(requestStream, responseStream);
                await State.Run();
            }
            else
            {
                throw new ArgumentException();
            }
        });
    }
    
    public sealed class YtMusicState
    {
        private readonly IAsyncStreamReader<YtMusicToController> incoming;
        private readonly IServerStreamWriter<ControllerToYtMusic> outgoing;

        public YtMusicState(IAsyncStreamReader<YtMusicToController> incoming, IServerStreamWriter<ControllerToYtMusic> outgoing)
        {
            this.incoming = incoming;
            this.outgoing = outgoing;
        }

        internal async Task Run()
        {
            while (await incoming.MoveNext())
            {
                var c =  incoming.Current;
                switch (c.S2CCase)
                {
                    case YtMusicToController.S2COneofCase.StreamVolume:
                        this.volume = c.StreamVolume;
                        break;
                    case YtMusicToController.S2COneofCase.StreamPlayerState:
                        this.playerState = c.StreamPlayerState;
                        break;
                    case YtMusicToController.S2COneofCase.StreamNowPlaying:
                        this.nowPlaying = c.StreamNowPlaying;
                        break;
                    case YtMusicToController.S2COneofCase.StreamQueueState:
                        this.queueState = c.StreamQueueState;
                        break;
                }
            }
        }

        private double volume;
        private PlayerStateEnum playerState;
        private NowPlayingMsg nowPlaying;
        private QueueStateMsg queueState;

        public double Volume
        {
            get => volume;
            set
            {
                var msg = new ControllerToYtMusic();
                msg.SetVolume = value;
                outgoing.WriteAsync(msg);
            }
        }
        
        public PlayerStateEnum PlayerState
        {
            get => playerState;
        }

        public NowPlayingMsg NowPlaying
        {
            get => nowPlaying;
        }

        public QueueStateMsg QueueState
        {
            get => queueState;
        }

        public void DoNext()
        {
            var msg = new ControllerToYtMusic();
            msg.DoNext = new Empty();
            outgoing.WriteAsync(msg);
        }
        
        public void DoPrevious()
        {
            var msg = new ControllerToYtMusic();
            msg.DoPrevious = new Empty();
            outgoing.WriteAsync(msg);
        }
        
        public void DoPlay()
        {
            var msg = new ControllerToYtMusic();
            msg.DoPlay = new Empty();
            outgoing.WriteAsync(msg);
        }

        public void DoPause()
        {
            var msg = new ControllerToYtMusic();
            msg.DoPause = new Empty();
            outgoing.WriteAsync(msg);
        }

        public void DoPlayQueueIndex(uint queueIndex)
        {
            var msg = new ControllerToYtMusic();
            msg.DoPlayQueueIndex = queueIndex;
            outgoing.WriteAsync(msg);
        }
    }
}
