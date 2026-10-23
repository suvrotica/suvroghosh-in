---
title: "Between a Click and a Page"
seoTitle: "How HTTP, TCP and Web Servers Work: An Interactive Explainer"
description: "Follow one article request through DNS, TCP, TLS and a web server. Change the delay, lose some bytes, reuse a connection and inspect the difference a cache makes."
date: "2026-10-23"
dateModified: "2026-10-23"
thumbnail: "/images/visualizations/between-a-click-and-a-page/social.png"
thumbnailAlt: "An isometric dispatch bench connecting a browser assembly window, address index, transport tracks, byte buffer and web-server workbench"
category: "Visualizations"
tags: ["Computer Science", "Internet", "HTTP", "TCP", "Web Servers", "Networking", "HTTPS", "Interactive Explainers", "DNS", "TLS"]
pinnedTags: ["Computer Science", "Internet", "HTTP", "TCP", "Web Servers", "Networking", "HTTPS", "Interactive Explainers", "DNS", "TLS"]
published: true
interactiveFirst: true
immersiveLead: true
color: "#8E6544"
author: "Suvro Ghosh"
readingTime: "9 min"
inPlainEnglish: "Opening a webpage asks several systems to cooperate. DNS helps find an address, IP gets packets across networks, TCP puts bytes in order, TLS protects their exchange, HTTP gives the request meaning, and server software prepares an answer. This model lets you see where the time goes."
keyTerms: ["DNS", "IP address", "TCP connection", "TLS", "HTTP request", "Round-trip time", "Web server", "Cache"]
faq:
  - question: "Are the internet and the Web the same thing?"
    answer: "No. The internet connects networks and carries many kinds of communication. The Web is one system built on it, using browsers, URLs and HTTP to exchange resources."
  - question: "Does TCP encrypt a webpage?"
    answer: "No. TCP supplies an ordered byte stream. In this HTTPS example, TLS supplies encryption, integrity and server authentication. HTTP supplies request and response meaning."
  - question: "Why can received bytes still be waiting?"
    answer: "TCP can receive later byte ranges before a missing earlier range. It holds the later bytes until the gap is repaired, then delivers the continuous stream in order."
  - question: "Does every HTTP request create a new connection?"
    answer: "No. An existing suitable connection can carry further requests. HTTP/1.1 supports persistent connections; HTTP/2 multiplexes streams over TCP. HTTP/3 uses QUIC over UDP."
  - question: "Is this a real network measurement?"
    answer: "No. It is a deterministic teaching model with chosen delays, a small illustrative response and simplified loss recovery. The timings are simulated, and no packets are captured."
---

<script>
	import ClickToPage from '$lib/components/visualizations/between-a-click-and-a-page/ClickToPage.svelte';
</script>

You click an article. The little circle turns. Somewhere between your finger and a paragraph, several computers have begun negotiating the terms of your impatience.

Choose **Follow the request**, then use **Next step** to inspect the work. Afterwards, lose one piece of the response. A missing piece can explain more than a perfect journey.

<ClickToPage />

<TTS />

<p><small>Published <time datetime="2026-10-23">23 October 2026</time> · Updated <time datetime="2026-10-23">23 October 2026</time></small></p>

## The page is not inside the wire

Imagine opening an article on a wet Calcutta afternoon. Your browser must obtain enough information to draw words, arrange them and fetch whatever else the page needs. The screen conceals the cooperation. It gives you a spinner, that small administrative shrug.

The **internet** is the larger arrangement of interconnected networks. The **Web** is one use of it: linked resources, addressed by URLs, requested by browsers and other clients. Email and many other services use the internet too. Calling the whole thing “the Web” is rather like calling Calcutta a newspaper because that is what arrived this morning.

Our dispatch bench follows one HTTPS article request. HTTPS means HTTP used with transport security. The address index, couplings, tracks and receiving tray give otherwise invisible work somewhere to happen. Their movement stands for software decisions and communication, not an actual machine hidden in a data centre.

## First, an address

People remember a name such as `example.com`. A computer needs address information to try reaching its service. The **Domain Name System**, or DNS, supplies records associated with names; address records are the ones this journey needs. A resolver may already have a usable cached answer. Otherwise, it asks DNS servers for help. The index drawer represents that lookup. ([DNS specification](https://www.rfc-editor.org/rfc/rfc1034.html#section-2.4))

The answer is not necessarily the address of one permanent box. A site can use several addresses, or direct visitors towards infrastructure serving its content.

The **Internet Protocol**, or IP, supplies addressing and the packet format used across the network. Routers forward packets towards their destinations. DNS helps discover an address; it does not prescribe every turn in the journey. ([IPv6 specification](https://www.rfc-editor.org/rfc/rfc8200.html))

A name, an address and a route perform different jobs. Giving them one vague label, “the connection”, is how a small confusion acquires a mortgage.

## Agreeing to exchange bytes

In the baseline example, the browser opens a **Transmission Control Protocol**, or TCP, connection. Its usual three-way handshake establishes shared connection state, including starting sequence numbers. Reusing an existing connection avoids doing that setup again. The couplings on the bench represent that agreement. They reserve no private road through the internet.

Next comes **Transport Layer Security**, or TLS. In an ordinary certificate-based HTTPS visit, the browser checks the server's claimed identity and the peers establish keys. Their subsequent exchange gets confidentiality and protection against undetected alteration. The protected channel can still carry nonsense, fraud or a terrible opinion. Encryption has no editorial department. ([TLS 1.3 specification](https://www.rfc-editor.org/rfc/rfc8446.html#section-1))

TCP setup, TLS setup and the request are distinct jobs. The default walkthrough uses a fresh TCP connection with TLS 1.3. The reused setting means a suitable connection is already established and protected, rather than a newly opened connection somehow escaping the rules.

## The browser asks. The server has to understand.

**Hypertext Transfer Protocol**, or HTTP, gives the exchange meaning. A request identifies a resource and an operation, such as `GET`, which asks to retrieve a representation. A response includes a status, fields describing the answer, and content where appropriate. The browser is the **client**, the participant making this request. “Client” names a role, not a species of computer. ([HTTP semantics](https://www.rfc-editor.org/rfc/rfc9110.html#section-1.3))

On the other side, a **web server** is software receiving and answering HTTP requests. The phrase also gets used for the machine running that software. Context does some unpaid labour here.

A common socket-based server keeps a **listening socket** ready for incoming connections. Accepting one produces a **connected socket** for exchanging that client's bytes. The listener can continue accepting others. A socket is the program's interface to network communication, not a hole you could inspect with a torch. ([Socket interface examples](https://docs.python.org/3/library/socket.html#example))

The server reads bytes, parses the HTTP message and chooses a handler. Parsing means recognising the message's structure. The handler supplies the requested result: perhaps an existing file, perhaps output assembled by an application. A database is optional. A perfectly respectable article can exist without consulting a second computer about its right to be a paragraph.

The server workbench represents this work. The other client fittings remind us that serving one visitor need not mean refusing the next. Servers can use event loops, workers or combinations of approaches. Nginx, for example, uses an event-based design with worker processes; this is a concrete implementation, not a commandment issued to every server. ([Nginx architecture](https://nginx.org/en/docs/beginners_guide.html))

## Lose a piece. Watch what waits.

The response in this model has four teaching tiles, each representing 1,200 bytes. TCP delivers a continuous byte stream in order. Its segments need not match HTTP messages or the application's individual writes.

Introduce one loss. Later ranges arrive and sit in the receiving tray. The browser cannot receive them through TCP ahead of the missing earlier bytes. After recovery fills the gap, the continuous portion can advance. Sequence numbers locate bytes; acknowledgements report progress, rather than providing a separate immediate receipt for every illustrated tile. ([TCP specification](https://www.rfc-editor.org/rfc/rfc9293.html#section-2.2))

Watch the difference between *arrived* and *delivered*. Something can be physically present at the receiving end and still be unavailable to the next layer. The tray is useful precisely because it makes that awkward middle condition visible.

The four tiles are a small sample response. They are not four universal parcels into which every webpage gets folded.

## The different kinds of waiting

**Round-trip time**, or RTT, measures a journey out and back. The default is 120 milliseconds. Increase it and exchanges needing a reply take longer even when little information travels. A wider road does not remove the distance between the two ends.

The **server work** setting starts at 80 milliseconds. Increasing it delays preparation of the answer. A nearby server can therefore feel slow while a request is waiting for work. Faster transport cannot finish the handler's job for it.

Try the same settings with a reused connection. Some preparation has already happened. This is why opening a second resource can differ from starting a fresh visit, even before any content is cached.

Then choose a fresh cached response. Here the cache is in the **browser**: a suitable stored answer can be reused without travelling to the origin. Freshness has rules; a browser cannot assume every old copy remains valid forever. Revalidation is a different operation, checking whether a stored answer remains usable. ([HTTP caching](https://www.rfc-editor.org/rfc/rfc9111.html#section-4.2))

A **content delivery network**, or CDN, can also store responses nearer to visitors. That still requires reaching the CDN's server. An edge cache and a browser cache remove different journeys. Neither is a more expensive synonym for memory.

## The answer becomes a page

HTML, the **Hypertext Markup Language**, describes the document's structure. A browser parses it into a document representation. Parsing proceeds as usable input becomes available; it need not wait for every resource belonging to the eventual page. ([HTML parsing standard](https://html.spec.whatwg.org/multipage/parsing.html#overview-of-the-parsing-model))

The browser can discover further requests: a stylesheet governing appearance, an image, a script. These may come from the same service or another origin. Layout and painting turn the accumulated information into something you can read. Later arrivals can change what is visible.

The assembly window therefore represents progress, not a photograph travelling intact through the network. Your browser builds the page. The server sends the information from which it can do so.

## The agreement survives changes underneath

HTTP/1.1 supports persistent connections, allowing further exchanges without opening a connection for each request. HTTP/2 adds multiplexing: several HTTP streams share a TCP connection. Their messages can interleave, but a missing portion of TCP's ordered stream can still hold up later data belonging to several streams. ([HTTP/2 specification](https://www.rfc-editor.org/rfc/rfc9113.html#section-1))

HTTP/3 carries the same HTTP meanings over **QUIC**, using **User Datagram Protocol**, or UDP. QUIC supplies reliable streams and integrates TLS security. The raw properties of UDP are not being offered as a substitute for reliability. Stream-level delivery reduces the particular cross-stream waiting inherited from TCP; shared congestion and other delays still exist. HTTP/3 is not a promise that every connection becomes faster. ([HTTP/3 specification](https://www.rfc-editor.org/rfc/rfc9114.html#section-1.2))

Shared specifications let a browser and server built by different people cooperate across networks owned by other people. None needs to approve the article's argument before delivering it. Considering what gets published, this is an admirably reckless arrangement.

## A small drawer of terms

| Term | Its job in this journey |
| --- | --- |
| DNS | Looks up information associated with a name, including addresses the browser can try. |
| IP | Addresses packets so routers can forward them across networks towards a destination. |
| TCP | Maintains connection state and delivers a reliable, ordered byte stream. It does not encrypt it. |
| TLS | Protects the exchange against eavesdropping and undetected alteration, and authenticates the server in this example. |
| HTTP | Defines what the request asks for and what the response means. |
| Socket | Gives software an interface to network communication. A listener accepts connections; connected sockets exchange bytes. |
| RTT | The round-trip time for communication to travel out and back, separate here from server work. |
| Cache | Stores an answer for possible reuse. A fresh, suitable browser copy can avoid a network request. |

## Postscript: the bench and its limits

The mechanism is an educational model, not a packet capture. Its starting assumptions include a 120-millisecond RTT, fresh TCP and TLS 1.3 setup, 80 milliseconds of server work, and four 1,200-byte response ranges sent at an illustrative 60 bytes per millisecond. The controls change the model's assumptions. Every displayed time is simulated.

Loss recovery uses a chosen, repeatable delay. Real networks have changing congestion, different segment sizes, acknowledgement behaviour, retransmission timers and many competing connections. The tracks neither reproduce those algorithms nor reserve a physical route. TLS records and HTTP messages do not have to fit the teaching tiles. The browser assembly is schematic too.

The linked specifications above establish the protocol distinctions. For connection reuse, the remaining reference is the [HTTP/1.1 persistence specification](https://www.rfc-editor.org/rfc/rfc9112.html#section-9.3). The server examples illustrate implementations, rather than prescribing one architecture for the entire Web.

Choose **Start again**. Leave the server fast, lengthen the round trip, and watch where your click waits this time.
