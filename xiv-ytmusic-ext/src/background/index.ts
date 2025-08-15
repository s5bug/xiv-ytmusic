import {
  NowPlayingMsg,
  PlayerStateEnum,
  PlayerStateMsg,
  PlayQueueIndexMsg,
  QueueStateMsg,
  VolumeMsg,
  YtMusic,
  YtMusicClientImpl,
} from '../gen/xivytmusic'
import { Empty } from '../gen/google/protobuf/empty'
import { mergeMap, Observable, Observer, Subscriber, Subscription, Unsubscribable } from 'rxjs'
import { map } from 'rxjs/operators'

interface YtMusicPlayerElement extends HTMLElement {
  getPlayer(): YT.Player
}

interface YtMusicPlayButtonRendererElement extends HTMLElement {
  onTap(event: Event): void
}

interface YtFormattedStringElement extends HTMLElement {
  readonly title: string
}

chrome.runtime.onStartup.addListener(() => {
  console.log('startup! this message exists to work around a Chrome bug')
  console.log(YtMusicClientImpl)
})

const stateLookup: Record<number, PlayerStateEnum> = {
  [-1]: PlayerStateEnum.PS_UNSTARTED,
  0: PlayerStateEnum.PS_ENDED,
  1: PlayerStateEnum.PS_PLAYING,
  2: PlayerStateEnum.PS_PAUSED,
  3: PlayerStateEnum.PS_BUFFERING,
  5: PlayerStateEnum.PS_VIDEO_QUEUED,
}

const waitForElem = async <K extends Element>(selector: string): Promise<K> => {
  return new Promise((resolve) => {
    if (document.querySelector(selector)) {
      return resolve(document.querySelector<K>(selector)!)
    }

    const observer = new MutationObserver((_mutations) => {
      if (document.querySelector(selector)) {
        observer.disconnect()
        resolve(document.querySelector<K>(selector)!)
      }
    })

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    })
  })
}

const getOrCreateYtmTab = async () => {
  const extantYtmTabs = await chrome.tabs.query({
    url: '*://music.youtube.com/*',
  })
  let chosenTab
  if (extantYtmTabs.length > 0) {
    chosenTab = extantYtmTabs[0]
  } else {
    chosenTab = await chrome.tabs.create({
      url: 'https://music.youtube.com/',
      pinned: true,
      active: false,
    })
  }

  await chrome.scripting.executeScript({
    target: { tabId: chosenTab.id! },
    func: waitForElem,
    args: ['#player'],
    world: 'MAIN',
  })

  return chosenTab
}

const rpcHost = chrome.runtime.connectNative('tf.bug.xiv_ytmusic_rpchost')
console.log('rpc host started: ', rpcHost)

const tabCtxGetVolume = (): VolumeMsg => {
  const player: YT.Player = document.querySelector<YtMusicPlayerElement>('#player')!.getPlayer()

  return { volume: player.getVolume() }
}

const tabCtxSubscribeVolume = (portName: string, extensionId: string): void => {
  const player: YT.Player = document.querySelector<YtMusicPlayerElement>('#player')!.getPlayer()

  const port = chrome.runtime.connect(extensionId, { name: portName })

  const handler = (e: { volume: number }) => {
    const msg: VolumeMsg = { volume: e.volume }
    port.postMessage(msg)
  }

  port.onMessage.addListener(() => {
    // @ts-expect-error ytmusic player uses custom event names
    player.removeEventListener('onVolumeChange', handler)
  })

  // @ts-expect-error ytmusic player uses custom event names
  player.addEventListener('onVolumeChange', handler)

  // populate the response dictionary by sending the current state as well
  const now: VolumeMsg = { volume: player.getVolume() }
  port.postMessage(now)
}

const tabCtxSetVolume = (v: VolumeMsg): Empty => {
  const player: YT.Player = document.querySelector<YtMusicPlayerElement>('#player')!.getPlayer()
  player.setVolume(v.volume)
  return {}
}

const tabCtxSubscribePlayerState = (portName: string, extensionId: string): void => {
  const player: YT.Player = document.querySelector<YtMusicPlayerElement>('#player')!.getPlayer()

  const port = chrome.runtime.connect(extensionId, { name: portName })

  const handler = (e: number) => {
    port.postMessage(e)
  }

  port.onMessage.addListener(() => {
    // @ts-expect-error ytmusic player uses custom event names
    player.removeEventListener('onStateChange', handler)
  })

  // @ts-expect-error ytmusic player uses custom event names
  player.addEventListener('onStateChange', handler)

  // populate the response dictionary by sending the current state as well
  const now: number = player.getPlayerState()
  port.postMessage(now)
}

const tabCtxDoNext = (): Empty => {
  const player: YT.Player = document.querySelector<YtMusicPlayerElement>('#player')!.getPlayer()

  player.nextVideo()

  return {}
}

const tabCtxDoPause = (): Empty => {
  const player: YT.Player = document.querySelector<YtMusicPlayerElement>('#player')!.getPlayer()

  player.pauseVideo()

  return {}
}

const tabCtxDoPlay = (): Empty => {
  const player: YT.Player = document.querySelector<YtMusicPlayerElement>('#player')!.getPlayer()

  player.playVideo()

  return {}
}

const tabCtxDoPlayQueueIndex = (request: PlayQueueIndexMsg): Empty => {
  const app = document.querySelector('ytmusic-app')!
  const queue = app.querySelector('ytmusic-player-queue')!
  const queueContents = queue.querySelector('#contents')
  const queueChildren = queueContents?.children

  const child = queueChildren?.item(request.index)
  const childPlayButton
    = child?.querySelector<YtMusicPlayButtonRendererElement>('ytmusic-play-button-renderer')

  childPlayButton?.onTap(new Event('pointerdown'))

  return {}
}

const tabCtxDoPrevious = (): Empty => {
  const player: YT.Player = document.querySelector<YtMusicPlayerElement>('#player')!.getPlayer()

  player.previousVideo()

  return {}
}

const tabCtxGetNowPlaying = (): NowPlayingMsg => {
  const playerElem = document.querySelector<YtMusicPlayerElement>('#player')!
  const player: YT.Player = playerElem.getPlayer()

  const title: string = player.getVideoData().title
  const author: string = player.getVideoData().author
  const coverUrl: string
    = playerElem.querySelector<HTMLImageElement>('#song-image #thumbnail img')!.src
  const thumbnailUrl: string
    = coverUrl

  return {
    title: title,
    author: author,
    coverUrl: coverUrl,
    thumbnailUrl: thumbnailUrl,
  }
}

const tabCtxGetPlayerState = (): number => {
  const player: YT.Player = document.querySelector<YtMusicPlayerElement>('#player')!.getPlayer()

  return player.getPlayerState()
}

const tabCtxGetQueueState = (): QueueStateMsg => {
  const app = document.querySelector('ytmusic-app')!
  const queue = app.querySelector('ytmusic-player-queue')!
  const queueContents = queue.querySelector('#contents')
  const queueChildren = queueContents?.children

  const qca = Array.from(queueChildren!)

  const elementIsSelected = (qi: Element) => {
    return qi.hasAttribute('selected')
      || (qi.querySelector('#primary-renderer ytmusic-player-queue-item')?.hasAttribute('selected') ?? false)
  }

  const idx = qca.findIndex(elementIsSelected)

  return {
    currentIndex: idx === -1 ? undefined : idx,
    items: qca.map((e) => {
      return {
        title: e.querySelector<YtFormattedStringElement>('.song-title')!.title,
        author: e.querySelector<YtFormattedStringElement>('.byline')!.title,
        thumbnailUrl: e.querySelector<HTMLImageElement>('.yt-img-shadow')!.src,
      }
    }),
  }
}

const tabCtxSubscribeQueueState = (portName: string, extensionId: string): void => {
  const app = document.querySelector('ytmusic-app')!
  const queue = app.querySelector('ytmusic-player-queue')!

  const port = chrome.runtime.connect(extensionId, { name: portName })

  const handler = (_records: MutationRecord[]) => {
    const app = document.querySelector('ytmusic-app')!
    const queue = app.querySelector('ytmusic-player-queue')!

    const queueContents = queue.querySelector('#contents')
    const queueChildren = queueContents?.children

    const qca = Array.from(queueChildren!)

    const elementIsSelected = (qi: Element) => {
      return (qi.hasAttribute('selected')
        || qi.querySelector('#primary-renderer > ytmusic-player-queue-item')?.hasAttribute('selected'))
      ?? false
    }

    const idx = qca.findIndex(elementIsSelected)

    const msg: QueueStateMsg = {
      currentIndex: idx === -1 ? undefined : idx,
      items: qca.map((e) => {
        return {
          title: e.querySelector<YtFormattedStringElement>('.song-title')!.title,
          author: e.querySelector<YtFormattedStringElement>('.byline')!.title,
          thumbnailUrl: e.querySelector<HTMLImageElement>('.yt-img-shadow')!.src,
        }
      }),
    }
    port.postMessage(msg)
  }

  const config: MutationObserverInit = {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  }

  const mutationObserver = new MutationObserver(handler)

  port.onMessage.addListener((_msg) => {
    mutationObserver.disconnect()
  })

  mutationObserver.observe(queue, config)

  // populate the response dictionary by sending the current state as well
  const queueContents = queue.querySelector('#contents')
  const queueChildren = queueContents?.children

  const qca = Array.from(queueChildren!)

  const elementIsSelected = (qi: Element) => {
    return (qi.hasAttribute('selected')
      || qi.querySelector('#primary-renderer > ytmusic-player-queue-item')?.hasAttribute('selected'))
    ?? false
  }

  const idx = qca.findIndex(elementIsSelected)

  const now: QueueStateMsg = {
    currentIndex: idx === -1 ? undefined : idx,
    items: qca.map((e) => {
      return {
        title: e.querySelector<YtFormattedStringElement>('.song-title')!.title,
        author: e.querySelector<YtFormattedStringElement>('.byline')!.title,
        thumbnailUrl: e.querySelector<HTMLImageElement>('.yt-img-shadow')!.src,
      }
    }),
  }
  port.postMessage(now)
}

const unaryYtmCall = async <Args extends unknown[], Result>(func: (...args: Args) => Result, args: Args): Promise<Awaited<Result>> => {
  const tab = await getOrCreateYtmTab()
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id! },
    func: func,
    args: args,
    world: 'MAIN',
  })
  return (result.result as Awaited<Result>)
}

const streamYtmSubscribe: <Args extends unknown[], Result>(
  tabCtxSubscribe: (portName: string, extensionId: string, ...args: Args) => (void | Promise<void>),
  args: Args,
  subscriber: Subscriber<Result>
) => Unsubscribable = (tabCtxSubscribe, args, subscriber) => {
  const portName = crypto.randomUUID()

  const ready: Promise<chrome.runtime.Port> = (async () => {
    const tab = await getOrCreateYtmTab()

    const portPromise = new Promise<chrome.runtime.Port>((resolve) => {
      const listener = (port: chrome.runtime.Port) => {
        if (port.name !== portName) return

        chrome.runtime.onConnectExternal.removeListener(listener)
        port.onMessage.addListener(m => subscriber.next(m)) // eslint-disable-line @typescript-eslint/no-unsafe-argument
        resolve(port)
      }

      chrome.runtime.onConnectExternal.addListener(listener)
    })

    const [_result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id! },
      func: tabCtxSubscribe,
      args: [portName, chrome.runtime.id, ...args],
      world: 'MAIN',
    })

    return await portPromise
  })()

  return {
    unsubscribe() {
      (void ready.then((port) => {
        void port.postMessage({})
        port.disconnect()
      }))
    },
  }
}

const streamYtmObservable = <Args extends unknown[], Result>(
  tabCtxSubscribe: (portName: string, extensionId: string, ...args: Args) => (void | Promise<void>),
  args: Args,
): Observable<Result> => {
  return new Observable<Result>(subscriber => streamYtmSubscribe(
    tabCtxSubscribe,
    args,
    subscriber,
  ))
}

const playerStateObservable: Observable<PlayerStateMsg>
  = streamYtmObservable<[], number>(tabCtxSubscribePlayerState, []).pipe(map(stateNumber => ({
    state: stateLookup[stateNumber],
  })))

const queueStateObservable: Observable<QueueStateMsg>
  = streamYtmObservable(tabCtxSubscribeQueueState, [])

const volumeObservable: Observable<VolumeMsg>
  = streamYtmObservable(tabCtxSubscribeVolume, [])

const ytMusicServer: YtMusic = {
  async DoNext(_request: Empty): Promise<Empty> {
    return await unaryYtmCall(tabCtxDoNext, [])
  },
  async DoPause(_request: Empty): Promise<Empty> {
    return await unaryYtmCall(tabCtxDoPause, [])
  },
  async DoPlay(_request: Empty): Promise<Empty> {
    return await unaryYtmCall(tabCtxDoPlay, [])
  },
  async DoPlayQueueIndex(request: PlayQueueIndexMsg): Promise<Empty> {
    return await unaryYtmCall(tabCtxDoPlayQueueIndex, [request])
  },
  async DoPrevious(_request: Empty): Promise<Empty> {
    return await unaryYtmCall(tabCtxDoPrevious, [])
  },
  async GetNowPlaying(_request: Empty): Promise<NowPlayingMsg> {
    return await unaryYtmCall(tabCtxGetNowPlaying, [])
  },
  async GetPlayerState(_request: Empty): Promise<PlayerStateMsg> {
    const stateNumber = await unaryYtmCall(tabCtxGetPlayerState, [])
    return {
      state: stateLookup[stateNumber],
    }
  },
  async GetQueueState(_request: Empty): Promise<QueueStateMsg> {
    return await unaryYtmCall(tabCtxGetQueueState, [])
  },
  async GetVolume(_request: Empty): Promise<VolumeMsg> {
    return await unaryYtmCall(tabCtxGetVolume, [])
  },
  NowPlaying(_request: Empty): Observable<NowPlayingMsg> {
    return playerStateObservable.pipe(mergeMap(
      async () => await unaryYtmCall(tabCtxGetNowPlaying, []),
    ))
  },
  PlayerState(_request: Empty): Observable<PlayerStateMsg> {
    return playerStateObservable
  },
  QueueState(_request: Empty): Observable<QueueStateMsg> {
    return queueStateObservable
  },
  async SetVolume(request: VolumeMsg): Promise<Empty> {
    return await unaryYtmCall(tabCtxSetVolume, [request])
  },
  Volume(_request: Empty): Observable<VolumeMsg> {
    return volumeObservable
  },
}

interface RpcUnsub {
  tx_id: string
}

interface RpcMsg {
  message: unknown
  tx_id: string
  method: string
}

const subscriptions: Record<string, Subscription> = {}

const handleMsg = async (msg: RpcMsg | RpcUnsub): Promise<void> => {
  if ('method' in msg) {
    if (!msg.method.startsWith('/YtMusic/')) return

    const methodName: keyof YtMusic = (msg.method.substring('/YtMusic/'.length)) as keyof YtMusic
    const caller
      = ytMusicServer[methodName] as ((message: unknown) => Promise<unknown> | Observable<unknown>)

    const result = caller(msg.message)

    if (result instanceof Observable) {
      const observer: Partial<Observer<unknown>> = {
        next(value: unknown) {
          const returnObj = { tx_id: msg.tx_id, message: value }
          console.log('returning stream message: ', returnObj)
          rpcHost.postMessage(returnObj)
        },
      }

      console.log('creating subscription')
      subscriptions[msg.tx_id] = result.subscribe(observer)
    } else {
      const returnMsg = await result
      const returnObj = { tx_id: msg.tx_id, message: returnMsg }

      console.log('returning unary message: ', returnObj)
      rpcHost.postMessage(returnObj)
    }
  } else {
    const subscription = subscriptions[msg.tx_id]
    if (subscription === undefined) return

    delete subscriptions[msg.tx_id]
    subscription.unsubscribe()
  }
}

rpcHost.onMessage.addListener((msg: RpcMsg | RpcUnsub) => {
  console.log('received msg: ', msg)
  ;(void handleMsg(msg))
})
