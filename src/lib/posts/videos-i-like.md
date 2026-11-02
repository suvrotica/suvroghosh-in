---
title: "Videos I Like"
seoTitle: "Videos I Like — Music, Films, Audiobooks and Ideas"
description: "Browse videos and playlists saved in my posts and notes. Choose music, films, maths, science, technology or food, then watch through YouTube."
date: "2026-11-03"
dateModified: "2026-11-03"
thumbnail: "/images/visualizations/videos-i-like/social.png"
thumbnailAlt: "Videos I Like: a simple thumbnail gallery with tabs for music, films, audiobooks and ideas"
category: "Visualizations"
collections: ["apps"]
tags: ["YouTube", "Videos", "Playlists", "Music", "Films", "Audiobooks", "Documentaries", "Mathematics", "Science", "Technology"]
pinnedTags: ["YouTube", "Videos", "Playlists", "Music", "Films", "Audiobooks", "Documentaries", "Mathematics", "Science", "Technology"]
published: true
interactiveFirst: true
immersiveLead: true
color: "#246448"
author: "Suvro Ghosh"
readingTime: "2 min"
inPlainEnglish: "A collection of videos and playlists from my posts and saved notes. Pick a topic and press Play. The gallery checks availability, and YouTube handles playback."
keyTerms: ["YouTube", "Playlist", "Media permission"]
faq:
  - question: "Why is a saved video missing?"
    answer: "The gallery hides videos that YouTube reports as unavailable or unsuitable for embedding. Videos that cannot be checked are kept out of the playable gallery until a check succeeds. The original source links remain available."
  - question: "Will every video play?"
    answer: "An availability check cannot guarantee playback for every viewer. YouTube may apply regional, account or other restrictions when playback starts. Open the original YouTube link or choose another video if that happens."
  - question: "Does opening this page load YouTube?"
    answer: "The site checks catalogue metadata on its server. Your browser loads YouTube thumbnails and the player only after your saved media permission or an explicit Load YouTube content action."
  - question: "Are these my own videos?"
    answer: "These are videos and playlists collected from my posts and saved notes. Each links to the original upload or playlist on YouTube, where its creator and channel are credited."
---

<script>
    import VideosILike from '$lib/components/visualizations/videos-i-like/VideosILike.svelte';
</script>

<VideosILike />

A collection of videos and playlists from my posts and saved notes. Pick a topic and press Play.

## Choose something to watch

The tabs separate music, films, audiobooks, documentaries, maths, science, technology, food and talks. Music also has filters for Bengali, Hindi, English and Rabindrasangeet. Search looks through the available titles, channels and topics.

For example, open **Maths** to find linear algebra and statistics courses, or **Science** for physics and biology. Select a thumbnail to open the player. A playlist shows the videos that have passed the current availability check, in their original order.

## When a video is missing

Uploads change. A video may become private, disappear, or stop allowing playback on other websites. The gallery checks YouTube's information when you open it and uses a short cache to avoid repeating the same requests unnecessarily. **Refresh videos** requests the current results again.

Some restrictions only appear when you press Play. If that happens, choose another video or follow **Open video on YouTube**. A failed connection does not mean that the video has been deleted.

The collection is checked in small batches, so available selections appear while the remaining checks continue. If a check is interrupted, **Continue checking** resumes it. Large playlists are also checked in sections. **Check more playlist videos** continues a playlist's check. Generated YouTube Mixes open on YouTube because their contents are not a fixed, reliably enumerable playlist.

## YouTube and your browser

The site can check the collection on its server before you load YouTube content. Thumbnails and the embedded player connect your browser to YouTube only after your saved media permission or an explicit load action. **Media preferences** lets you change the saved choice.

The original post links and saved-note collection labels are kept below the gallery, including when checks are temporarily unavailable. The notes themselves remain private. Follow the YouTube links to visit the original channels and uploads.
