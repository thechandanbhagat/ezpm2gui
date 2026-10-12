export interface DemoVideo {
  id: string;
  youtubeId: string;
  titleKey: string;
  descriptionKey: string;
  actionKey: string;
  featurePath: string;
  posterPath: string;
  durationSeconds: number;
}

// Add published demos here; the Help player and library share this catalog.
export const DEMO_VIDEOS: readonly DemoVideo[] = [
  {
    id: 'ai-log-analysis', youtubeId: 'EPwORhBHupU',
    titleKey: 'help.videos.ai.title', descriptionKey: 'help.videos.ai.description',
    actionKey: 'help.videos.ai.action', featurePath: '/logs',
    posterPath: '/images/demos/ai-log-analysis.jpg', durationSeconds: 63,
  },
  {
    id: 'product-walkthrough', youtubeId: 'u1ckawU-sg4',
    titleKey: 'help.videos.walkthrough.title', descriptionKey: 'help.videos.walkthrough.description',
    actionKey: 'help.videos.walkthrough.action', featurePath: '/processes',
    posterPath: '/images/demos/product-walkthrough.jpg', durationSeconds: 66,
  },
];

export const youtubeWatchUrl = (video: DemoVideo): string => `https://youtu.be/${video.youtubeId}`;
export const youtubeEmbedUrl = (video: DemoVideo): string =>
  `https://www.youtube-nocookie.com/embed/${video.youtubeId}?autoplay=1&rel=0`;
export const formatDemoDuration = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
