interface YtMusicApp extends HTMLElement { // eslint-disable-line @typescript-eslint/no-empty-object-type

}

interface YtMusicPlayerQueue extends HTMLElement { // eslint-disable-line @typescript-eslint/no-empty-object-type

}

interface YtMusicPlayerQueueItem extends HTMLElement { // eslint-disable-line @typescript-eslint/no-empty-object-type

}

interface YtMusicPlaylistPanelVideoWrapperRenderer extends HTMLElement { // eslint-disable-line @typescript-eslint/no-empty-object-type

}

interface YtMusicPlayButtonRenderer extends HTMLElement {
  onTap(ev: Event): void
}

const getMyPathByIndex = (element: HTMLElement | null): string => {
  if (element === null)
    return ''
  if (element.parentElement === null)
    return 'html'
  return getMyPathByIndex(element.parentElement) + '>' + ':nth-child(' + getMyIndex(element) + ')'
}

const getMyIndex = (element: HTMLElement): number => {
  if (element.parentElement === null)
    return 0

  const parent = element.parentElement

  for (let index = 0; index < parent.childElementCount; index++)
    if (parent.children[index] === element)
      return index + 1

  return -1
}

const app: () => YtMusicApp
  = () => document.querySelector('ytmusic-app')!
const queue: () => YtMusicPlayerQueue
  = () => app().querySelector('ytmusic-player-queue')!
const queueContents: () => HTMLDivElement | null
  = () => queue().querySelector('#contents')
const queueChildren: () => HTMLCollectionOf<YtMusicPlayerQueueItem | YtMusicPlaylistPanelVideoWrapperRenderer> | undefined
  = () => (queueContents()?.children) as (HTMLCollectionOf<YtMusicPlayerQueueItem | YtMusicPlaylistPanelVideoWrapperRenderer> | undefined)
const playButtonOf: (i: YtMusicPlayerQueueItem | YtMusicPlaylistPanelVideoWrapperRenderer) => YtMusicPlayButtonRenderer | null
  = i => i.querySelector('ytmusic-play-button-renderer')

const _indexOfCurrentQueueChild: () => number | undefined
  = () => {
    const qc = queueChildren()
    if (qc !== undefined) {
      return Array.from(qc).findIndex(qi => qi.hasAttribute('selected'))
    } else return undefined
  }

const _currentQueueChild: () => YtMusicPlayerQueueItem | YtMusicPlaylistPanelVideoWrapperRenderer | undefined
  = () => {
    const qc = queueChildren()
    if (qc !== undefined) {
      return Array.from(qc).find(qi => qi.hasAttribute('selected'))
    } else return undefined
  }

const _titleOf: (i: YtMusicPlayerQueueItem | YtMusicPlaylistPanelVideoWrapperRenderer) => string | undefined
  = (i) => {
    return i.querySelector<HTMLElement>('.song-title')?.title
  }

const _authorOf: (i: YtMusicPlayerQueueItem | YtMusicPlaylistPanelVideoWrapperRenderer) => string | undefined
  = (i) => {
    return i.querySelector<HTMLElement>('.byline')?.title
  }

const playInQueue: (i: number, cb: (m: unknown) => void) => void | undefined
  = (i, cb) => {
    const qc = queueChildren()?.item(i)
    if (qc !== undefined && qc !== null) {
      const pb = playButtonOf(qc)
      if (pb !== null) {
        return cb({ func: 'sendTapTo', args: [getMyPathByIndex(pb)] })
      } else return undefined
    } else return undefined
  }

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log(`received message`, message)
  playInQueue(message as number, sendResponse)
})
