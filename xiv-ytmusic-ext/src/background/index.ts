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
import { mergeAll, mergeMap, Observable, Observer, Subscriber, Subscription, Unsubscribable } from 'rxjs'
import { map } from 'rxjs/operators'

chrome.runtime.onStartup.addListener(() => {
  console.log("startup! this message exists to work around a Chrome bug")
  console.log(YtMusicClientImpl)
})

const stateLookup: Record<number, PlayerStateEnum> = {
  [-1]: PlayerStateEnum.PS_UNSTARTED,
  0: PlayerStateEnum.PS_ENDED,
  1: PlayerStateEnum.PS_PLAYING,
  2: PlayerStateEnum.PS_PAUSED,
  3: PlayerStateEnum.PS_BUFFERING,
  5: PlayerStateEnum.PS_VIDEO_QUEUED
}

const waitForElem = async <K extends Element>(selector: string): Promise<K> => {
  return new Promise(resolve => {
    if (document.querySelector(selector)) {
      return resolve(document.querySelector<K>(selector)!);
    }

    const observer = new MutationObserver(mutations => {
      if (document.querySelector(selector)) {
        observer.disconnect();
        resolve(document.querySelector<K>(selector)!);
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  });
}

const getOrCreateYtmTab = async () => {
  let extantYtmTabs = await chrome.tabs.query({
    url: "*://music.youtube.com/*"
  })
  let chosenTab;
  if(extantYtmTabs.length > 0) {
    chosenTab = extantYtmTabs[0]
  } else {
    chosenTab = await chrome.tabs.create({
      url: "https://music.youtube.com/",
      pinned: true,
      active: false
    })
  }

  await chrome.scripting.executeScript({
    target: { tabId: chosenTab.id! },
    func: waitForElem,
    args: [ "#player" ],
    world: "MAIN"
  })

  return chosenTab
}

let rpcHost = chrome.runtime.connectNative("tf.bug.xiv_ytmusic_rpchost")
console.log("rpc host started: ", rpcHost)

const tabCtxGetVolume = (): VolumeMsg => {
  // @ts-ignore
  let player: YT.Player = document.querySelector("#player").getPlayer()

  return { volume: player.getVolume() }
}

const tabCtxSubscribeVolume = (portName: string, extensionId: string): void => {
  // @ts-ignore
  let player: YT.Player = document.querySelector("#player").getPlayer()

  let port = chrome.runtime.connect(extensionId, { name: portName })

  let handler = (e: { volume: number }) => {
    const msg: VolumeMsg = { volume: e.volume }
    port.postMessage(msg)
  }

  port.onMessage.addListener(() => {
    // @ts-ignore
    player.removeEventListener("onVolumeChange", handler)
  })

  // @ts-ignore
  player.addEventListener("onVolumeChange", handler)

  // populate the response dictionary by sending the current state as well
  const now: VolumeMsg = { volume: player.getVolume() }
  port.postMessage(now)
}

const tabCtxSetVolume = (v: VolumeMsg): Empty => {
  // @ts-ignore
  let player: YT.Player = document.querySelector("#player").getPlayer()
  player.setVolume(v.volume)
  return {}
}

const tabCtxSubscribePlayerState = (portName: string, extensionId: string): void => {
  // @ts-ignore
  let player: YT.Player = document.querySelector("#player").getPlayer()

  let port = chrome.runtime.connect(extensionId, { name: portName })

  let handler = (e: number) => {
    port.postMessage(e)
  }

  port.onMessage.addListener(() => {
    // @ts-ignore
    player.removeEventListener("onStateChange", handler)
  })

  // @ts-ignore
  player.addEventListener("onStateChange", handler)

  // populate the response dictionary by sending the current state as well
  const now: number = player.getPlayerState()
  port.postMessage(now)
}

const tabCtxDoNext = (): Empty => {
  // @ts-ignore
  let player: YT.Player = document.querySelector("#player").getPlayer()

  player.nextVideo()

  return {}
}

const tabCtxDoPause = (): Empty => {
  // @ts-ignore
  let player: YT.Player = document.querySelector("#player").getPlayer()

  player.pauseVideo()

  return {}
}

const tabCtxDoPlay = (): Empty => {
  // @ts-ignore
  let player: YT.Player = document.querySelector("#player").getPlayer()

  player.playVideo()

  return {}
}

const tabCtxDoPlayQueueIndex = (request: PlayQueueIndexMsg): Empty => {
  const app = document.querySelector('ytmusic-app')!
  const queue = app.querySelector('ytmusic-player-queue')!
  const queueContents = queue.querySelector("#contents")
  const queueChildren = queueContents?.children

  const child = queueChildren?.item(request.index)
  const childPlayButton = child?.querySelector('ytmusic-play-button-renderer')

  // @ts-ignore
  childPlayButton?.onTap(new Event("pointerdown"))

  return {}
}

const tabCtxDoPrevious = (): Empty => {
  // @ts-ignore
  let player: YT.Player = document.querySelector("#player").getPlayer()

  player.previousVideo()

  return {}
}

const tabCtxGetNowPlaying = (): NowPlayingMsg => {
  const playerElem: HTMLElement = document.querySelector("#player")!
  // @ts-ignore
  let player: YT.Player = playerElem.getPlayer()

  // @ts-ignore
  const title: string = player.getVideoData().title
  // @ts-ignore
  const author: string = player.getVideoData().author
  const coverUrl: string =
    playerElem.querySelector<HTMLImageElement>("#song-image #thumbnail img")!.src
  const thumbnailUrl: string =
    coverUrl

  return {
    title: title,
    author: author,
    coverUrl: coverUrl,
    thumbnailUrl: thumbnailUrl
  }
}

const tabCtxGetPlayerState = (): number => {
  // @ts-ignore
  let player: YT.Player = document.querySelector("#player").getPlayer()

  return player.getPlayerState()
}

const tabCtxGetQueueState = (): QueueStateMsg => {
  const app = document.querySelector('ytmusic-app')!
  const queue = app.querySelector('ytmusic-player-queue')!
  const queueContents = queue.querySelector("#contents")
  const queueChildren = queueContents?.children

  const qca = Array.from(queueChildren!)

  const elementIsSelected = (qi: Element) => {
    return qi.hasAttribute("selected") ||
      (qi.querySelector("#primary-renderer ytmusic-player-queue-item")?.hasAttribute("selected") || false)
  }

  const idx = qca.findIndex(elementIsSelected)

  return {
    currentIndex: idx === -1 ? undefined : idx,
    items: qca.map(e => {
      return {
        title: e.querySelector<HTMLElement>(".song-title")?.title!,
        author: e.querySelector<HTMLElement>(".byline")?.title!,
        thumbnailUrl: e.querySelector<HTMLImageElement>(".yt-img-shadow")?.src!
      }
    })
  }
}

const tabCtxSubscribeQueueState = (portName: string, extensionId: string): void => {
  // @ts-ignore
  const app = document.querySelector('ytmusic-app')!
  const queue = app.querySelector('ytmusic-player-queue')!

  let port = chrome.runtime.connect(extensionId, { name: portName })

  let handler = (records: MutationRecord[]) => {
    const app = document.querySelector('ytmusic-app')!
    const queue = app.querySelector('ytmusic-player-queue')!
    const queueContents = queue.querySelector("#contents")
    const queueChildren = queueContents?.children

    const qca = Array.from(queueChildren!)

    const elementIsSelected = (qi: Element) => {
      return qi.hasAttribute("selected") ||
        qi.querySelector("#primary-renderer > ytmusic-player-queue-item")?.hasAttribute("selected")
    }

    const idx = qca.findIndex(elementIsSelected)

    const msg: QueueStateMsg = {
      currentIndex: idx === -1 ? undefined : idx,
      items: qca.map(e => {
        return {
          title: e.querySelector<HTMLElement>(".song-title")?.title!,
          author: e.querySelector<HTMLElement>(".byline")?.title!,
          thumbnailUrl: e.querySelector<HTMLImageElement>(".yt-img-shadow")?.src!
        }
      })
    }
    port.postMessage(msg)
  }

  const config: MutationObserverInit = {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true
  }

  const mutationObserver = new MutationObserver(handler)

  port.onMessage.addListener(msg => {
    mutationObserver.disconnect()
  })

  mutationObserver.observe(queue, config)

  // populate the response dictionary by sending the current state as well
  const queueContents = queue.querySelector("#contents")
  const queueChildren = queueContents?.children

  const qca = Array.from(queueChildren!)

  const elementIsSelected = (qi: Element) => {
    return qi.hasAttribute("selected") ||
      qi.querySelector("#primary-renderer > ytmusic-player-queue-item")?.hasAttribute("selected")
  }

  const idx = qca.findIndex(elementIsSelected)

  const now: QueueStateMsg = {
    currentIndex: idx === -1 ? undefined : idx,
    items: qca.map(e => {
      return {
        title: e.querySelector<HTMLElement>(".song-title")?.title!,
        author: e.querySelector<HTMLElement>(".byline")?.title!,
        thumbnailUrl: e.querySelector<HTMLImageElement>(".yt-img-shadow")?.src!
      }
    })
  }
  port.postMessage(now)
}

const unaryYtmCall = async <Args extends any[], Result>(func: (...args: Args) => Result, args: Args): Promise<Awaited<Result>> => {
  let tab = await getOrCreateYtmTab()
  let [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id! },
    func: func,
    args: args,
    world: "MAIN"
  })
  // @ts-ignore
  return result.result
}

const streamYtmSubscribe: <Args extends any[], Result>(
  tabCtxSubscribe: (portName: string, extensionId: string, ...args: Args) => (void | Promise<void>),
  args: Args,
  subscriber: Subscriber<Result>
) => Unsubscribable = (tabCtxSubscribe, args, subscriber) => {
  let portName = crypto.randomUUID()

  let ready: Promise<chrome.runtime.Port> = (async () => {
    let tab = await getOrCreateYtmTab()

    let portPromise: Promise<chrome.runtime.Port> = new Promise(resolve => {
      const listener = (port: chrome.runtime.Port) => {
        if (port.name !== portName) return

        chrome.runtime.onConnectExternal.removeListener(listener)
        port.onMessage.addListener(m => subscriber.next(m))
        resolve(port)
      }

      chrome.runtime.onConnectExternal.addListener(listener)
    })

    let [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id! },
      func: tabCtxSubscribe,
      args: [portName, chrome.runtime.id, ...args],
      world: "MAIN"
    })

    return await portPromise
  })()

  return {
    unsubscribe() {
      ready.then(port => {
        port.postMessage({})
        port.disconnect()
      })
    }
  }
}

const streamYtmObservable = <Args extends any[], Result>(
  tabCtxSubscribe: (portName: string, extensionId: string, ...args: Args) => (void | Promise<void>),
  args: Args
): Observable<Result> => {
  return new Observable<Result>(subscriber => streamYtmSubscribe(
    tabCtxSubscribe,
    args,
    subscriber
  ))
}

const playerStateObservable: Observable<PlayerStateMsg> =
  streamYtmObservable<[], number>(tabCtxSubscribePlayerState, []).pipe(map(stateNumber => ({
    state: stateLookup[stateNumber],
  })))

const queueStateObservable: Observable<QueueStateMsg> =
  streamYtmObservable(tabCtxSubscribeQueueState, [])

const volumeObservable: Observable<VolumeMsg> =
  streamYtmObservable(tabCtxSubscribeVolume, [])

const ytMusicServer: YtMusic = {
  async DoNext(request: Empty): Promise<Empty> {
    return await unaryYtmCall(tabCtxDoNext, [])
  },
  async DoPause(request: Empty): Promise<Empty> {
    return await unaryYtmCall(tabCtxDoPause, [])
  },
  async DoPlay(request: Empty): Promise<Empty> {
    return await unaryYtmCall(tabCtxDoPlay, [])
  },
  async DoPlayQueueIndex(request: PlayQueueIndexMsg): Promise<Empty> {
    return await unaryYtmCall(tabCtxDoPlayQueueIndex, [request])
  },
  async DoPrevious(request: Empty): Promise<Empty> {
    return await unaryYtmCall(tabCtxDoPrevious, [])
  },
  async GetNowPlaying(request: Empty): Promise<NowPlayingMsg> {
    return await unaryYtmCall(tabCtxGetNowPlaying, [])
  },
  async GetPlayerState(request: Empty): Promise<PlayerStateMsg> {
    const stateNumber = await unaryYtmCall(tabCtxGetPlayerState, [])
    return {
      state: stateLookup[stateNumber]
    }
  },
  async GetQueueState(request: Empty): Promise<QueueStateMsg> {
    return await unaryYtmCall(tabCtxGetQueueState, [])
  },
  async GetVolume(request: Empty): Promise<VolumeMsg> {
    return await unaryYtmCall(tabCtxGetVolume, [])
  },
  NowPlaying(request: Empty): Observable<NowPlayingMsg> {
    return playerStateObservable.pipe(mergeMap(
      async () => await unaryYtmCall(tabCtxGetNowPlaying, [])
    ))
  },
  PlayerState(request: Empty): Observable<PlayerStateMsg> {
    return playerStateObservable
  },
  QueueState(request: Empty): Observable<QueueStateMsg> {
    return queueStateObservable
  },
  async SetVolume(request: VolumeMsg): Promise<Empty> {
    return await unaryYtmCall(tabCtxSetVolume, [request])
  },
  Volume(request: Empty): Observable<VolumeMsg> {
    return volumeObservable
  }
}

interface RpcUnsub {
  tx_id: string
}

interface RpcMsg {
  message: any,
  tx_id: string,
  method: string
}

let subscriptions: Record<string, Subscription> = {}

const handleMsg = async (msg: RpcMsg | RpcUnsub): Promise<void> => {
  if("method" in msg) {
    if(!msg.method.startsWith("/YtMusic/")) return;

    const methodName = msg.method.substring("/YtMusic/".length)
    const caller: (request: any) => Promise<any> | Observable<any> =
      // @ts-ignore
      ytMusicServer[methodName]

    const result = caller(msg.message)

    if (result instanceof Observable) {
      const observer: Partial<Observer<any>> = {
        next(value: any) {
          const returnObj = { tx_id: msg.tx_id, message: value }
          console.log('returning stream message: ', returnObj)
          rpcHost.postMessage(returnObj)
        }
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
    if(subscription === undefined) return;

    delete subscriptions[msg.tx_id]
    subscription.unsubscribe()
  }
}

rpcHost.onMessage.addListener((msg: RpcMsg | RpcUnsub) => {
  console.log("received msg: ", msg)
  handleMsg(msg) // fire-and-forget
})
