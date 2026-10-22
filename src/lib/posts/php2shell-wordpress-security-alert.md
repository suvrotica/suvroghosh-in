---
title: "PHP2Shell Alert: WordPress Owners, Check Your Host Now"
description: "Two critical PHP flaws can affect WordPress sites. Check your host's patch status, the fixed PHP versions, and why WordPress updates alone won't help."
date: "2026-10-22"
thumbnail: "/images/art-php2shell-wordpress-security-alert.jpg"
thumbnailAlt: "A glowing PHP engine connects website panels, including a WordPress panel, beside a red warning triangle, a shattered shield, and a turquoise repair symbol."
category: "Cybersecurity"
tags: ["PHP", "PHP2Shell", "WordPress", "Cybersecurity", "Web Hosting", "Security Updates", "Remote Code Execution", "Server Security", "Vulnerability Management", "SuvroGhosh"]
pinnedTags: ["PHP", "PHP2Shell", "WordPress", "Cybersecurity", "Web Hosting", "Security Updates", "Remote Code Execution", "Server Security", "Vulnerability Management", "SuvroGhosh"]
published: true
color: "#B42318"
---

<TTS />

<Pi src="/images/art-php2shell-wordpress-security-alert.jpg" alt="A glowing PHP engine connects website panels, including a WordPress panel, beside a red warning triangle, a shattered shield, and a turquoise repair symbol." />

**Security alert, October 22, 2026. If you run a WordPress website, check whether your hosting provider has patched PHP for PHP2Shell. Updating WordPress alone does not fix this. WordPress.com says its hosted sites are already protected.**

A WordPress dashboard can say everything is up to date while the PHP underneath still needs patching. That is the part to check.

On October 21, the PHP project released emergency security updates for two critical vulnerabilities, **CVE-2026-109618** and **CVE-2026-109619**, collectively called **PHP2Shell**. Under the relevant conditions, an attacker can run code on an affected server without logging in. The [PHP Foundation's technical account](https://thephp.foundation/blog/2026/10/21/todays-php-security-release-and-how-were-strengthening-php-security/) describes problems in memory management and error handling, with remote code execution demonstrated in affected configurations.

WordPress runs on PHP. So yes, this concerns WordPress owners, including people running an ordinary blog who have never had any reason to think about the software beneath it.

The vulnerability is in that underlying runtime. [WordPress.org's advisory](https://wordpress.org/news/2026/10/critical-php-security-release/) urges owners to update PHP and says no WordPress update is required or planned for these particular issues. Waiting for a new WordPress release would mean waiting for the wrong fix.

## Which WordPress sites need attention?

| Where the site runs | What the owner needs to do |
| --- | --- |
| WordPress.com | Automattic says protection is already in place. No customer action is required for these vulnerabilities. |
| WordPress VIP, WP Cloud, Pressable, or Tumblr | Automattic includes these services in its protection announcement. |
| WordPress installed with another hosting company | Check that company's current advisory and confirm whether the PHP serving your site has been patched. |
| A server or VPS you administer yourself | Apply the appropriate PHP security update and follow your vendor's deployment instructions. |

That first distinction matters. **WordPress, the software, and WordPress.com, the hosting service, are different things.** A site using WordPress at another host does not inherit WordPress.com's protection announcement. The assurance comes from [Automattic's statement about its own platforms](https://wordpress.com/blog/2026/10/21/php2shell-vulnerabilities/).

## The PHP releases containing the fix

The PHP project released these patched versions on October 21:

| PHP branch | Security release |
| --- | --- |
| 8.2 | **8.2.35** |
| 8.3 | **8.3.36** |
| 8.4 | **8.4.27** |
| 8.5 | **8.5.12** |

These are the upstream release numbers in the [official PHP announcement](https://www.php.net/archive/2026.php#2026-10-21-5). Linux distributions and commercial vendors can backport fixes while retaining a different package version, so check the vendor's security advisory rather than judging a package solely by its upstream number.

**PHP 8.1 and earlier no longer receive security updates from the PHP project.** If you still use one, obtain explicit confirmation of a vendor-provided backport or move to a supported, patched release. “It is an old website” does not make the server less reachable.

## What to check now

1. **Find the PHP version used by the website.** In WordPress, open **Tools → Site Health → Info → Server**. Your hosting control panel may also show it. WordPress.org documents this check in its advisory.
2. **Confirm the patch with your host.** Ask whether the PHP installation actually serving your site has fixes for both CVEs. A statement that WordPress and plugins are current does not answer that question.
3. **If you administer the server, update through the appropriate vendor channel.** Preserve a known-good backup, apply the security update promptly, follow any required service-restart instructions, and verify the running web service. Avoid copying a random server command from a social-media post into a machine you depend on.
4. **Do not treat a firewall rule as the completed repair.** The PHP project says there are no complete mitigations and directs users to update. Firewall protections can reduce exposure while patching proceeds; they do not replace the PHP fix.

If immediate remediation is impossible, [WordPress.org relays national cybersecurity-agency advice](https://wordpress.org/news/2026/10/critical-php-security-release/) to consider taking the affected system offline until it can be fully mitigated. Coordinate that decision with whoever operates the service, especially where people depend on it.

An affected PHP installation is not proof that somebody has already broken in. Equally, a site continuing to load normally does not establish that it is safe. Exploitability depends on the server setup and application paths; visible damage is not the test.

Get a specific answer from the person responsible for the server: **has the PHP serving this site been patched for both CVE-2026-109618 and CVE-2026-109619?**

---

*Status reflects the official announcements available on October 22, 2026. The illustration is conceptual and AI-generated.*
