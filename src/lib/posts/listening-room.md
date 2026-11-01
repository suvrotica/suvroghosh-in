---
title: "Listening Room — YouTube and Local Audio"
seoTitle: "Listening Room — YouTube Playlists and an Audio Equaliser"
description: "Play YouTube songs and playlists. Adjust local files with a ten-band equaliser, or add the optional Edge extension to equalise YouTube tab audio."
date: "2026-11-02"
dateModified: "2026-11-02"
thumbnail: "/images/visualizations/listening-room/social.png"
thumbnailAlt: "Listening Room's charcoal music player with green controls, a song selector and a starter playlist"
category: "Visualizations"
collections: ["apps"]
tags: ["Music", "Audio", "YouTube", "Equaliser", "Playlists", "Browser Tools", "Web Audio", "Stereo Sound", "Local Audio", "Music Player"]
pinnedTags: ["Music", "Audio", "YouTube", "Equaliser", "Playlists", "Browser Tools", "Web Audio", "Stereo Sound", "Local Audio", "Music Player"]
published: true
interactiveFirst: true
immersiveLead: true
color: "#207451"
author: "Suvro Ghosh"
readingTime: "3 min"
inPlainEnglish: "Choose a song, paste a YouTube playlist, or open an audio file. Adjust local files with an equaliser and stereo controls. The optional Listening Room extension lets those controls work with YouTube tab audio too. Your sound settings are saved in this browser."
keyTerms: ["Equaliser", "Stereo", "Audio spectrum", "Sample rate", "Lossy compression"]
faq:
  - question: "Can Listening Room equalise a YouTube video?"
    answer: "Yes, with the optional Listening Room browser extension. Install it in Edge, open Listening Room and activate the extension from the toolbar. It processes the tab's output on your device using the app's sound controls. Without the extension, EQ applies only to local audio files."
  - question: "Are my audio files uploaded?"
    answer: "No. Audio files play and are processed in your browser on your device. YouTube playback separately connects to YouTube after permission or explicit activation."
  - question: "Does this turn YouTube into lossless or high-resolution audio?"
    answer: "No. YouTube chooses the stream it supplies. Listening Room cannot recover information removed by compression. Local-file support depends on the browser, and the processing sample rate does not establish the original file's resolution or the output device's format."
  - question: "Can I play a whole playlist?"
    answer: "Yes. Paste a YouTube playlist link, choose a whole playlist when a link contains both a video and a playlist, or use the starter collection. Some videos and playlists may be unavailable or may not allow embedding."
---

<script>
	import ListeningRoom from '$lib/components/visualizations/listening-room/ListeningRoom.svelte';
</script>

<ListeningRoom />

<p><small>Updated <time datetime="2026-11-02">2 November 2026</time></small></p>

Choose a song, paste a YouTube playlist, or open an audio file. Keep the controls simple, and adjust the sound when the source allows it.

## Start with a song

Choose **Adele — Hello** from the popular songs, load the player, then press Play. YouTube handles the video and audio. The player stays visible, and its own controls remain available.

For a longer listen, paste a playlist link or choose the starter collection. Previous, next, shuffle and repeat help you move through it. A link that includes both a song and a playlist lets you choose which one to load.

YouTube decides whether a particular upload can play here. If it is unavailable, use **Open on YouTube** or choose another song.

## Adjust an audio file

Open a file from your device to use the equaliser. Start at neutral, raise a low-frequency band by a small amount, then use bypass to compare. A little adjustment is often enough; more bass does not automatically mean better sound.

The ten bands let you change different parts of the sound. Balance changes the relative level of the two channels. Stereo width changes their shared and differing content, while mono brings them together. Reset returns the settings to neutral.

The spectrum shows where the energy is in the audio currently playing. The level meters show the two output channels. These are measurements of your local playback, so they appear in Audio file mode rather than pretending to read the YouTube stream.

Your file stays on your device. Supported formats depend on your browser. A file that the browser cannot decode will need another player or a compatible copy.

## Use the equaliser with YouTube

The optional **Listening Room extension** connects the same sound controls to this tab's audio. Open **Set up the Edge extension** in the player for the download and installation steps. This is a custom extension you install manually, not an Edge Add-ons store listing.

After installation, refresh the page, load a song, and click Listening Room in Edge's extensions toolbar. When **Tab equaliser is on** appears, try **Gentle bass**, then **Bypass effects** to compare. YouTube's video and playback controls stay visible. The extension does not fix a video that YouTube refuses to play.

Your EQ, volume, mute, source choice, expanded controls, shuffle and repeat are saved in this browser. Closing a tab ends playback and the extension connection. Open Listening Room and click the extension again for the next session; the sound settings return. Local files and listening history are not saved. If the browser blocks storage, the app tells you that settings will last only while the tab remains open.

The extension processes the active Listening Room tab on your device. It does not record audio, upload it, or start capture automatically. Switching to Audio file mode ends tab processing so the file is not equalised twice.

## What happens to the sound?

An equaliser changes tone. A volume adjustment changes level. Neither can restore information that was removed when a recording was compressed.

Modern codecs such as Opus can make efficient use of a small stream by representing perceptually important detail. The result still depends on the source, encoding choices, listening conditions and listener. There is no switch here that makes every stream lossless.

YouTube manages its own stream and any processing it applies. Local audio starts with neutral settings, and the controls show the processing you choose. Listening Room does not add an automatic compressor or claim to measure loudness in LUFS.

The processing sample rate describes the browser's audio graph. It is not a certificate of the original recording's resolution, and it does not establish what your headphones, speakers or operating system deliver.

For the implementation details, see the [YouTube player API](https://developers.google.com/youtube/iframe_api_reference), the [Web Audio specification](https://www.w3.org/TR/webaudio/) and the [Opus codec documentation](https://opus-codec.org/docs/).
