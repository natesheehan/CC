This policy explains what information Concept Cartography collects, why, and what you can do about it. We have tried to write it plainly. The short version: **we collect very little**, we don't sell anything, and we don't track you.

> Concept Cartography is an experimental, open-source project. As the software changes, this policy may change too. See "Changes to this policy" below.

## What we collect

### When you sign in

Signing in asks only for a **display name**. We don't ask for an email address, password or any other contact details. When you sign in we store:

- your **display name**;
- an **avatar colour** generated from that name;
- the **date your account was created**;
- a **session record** (a random identifier, when it was created and when it expires) that keeps you signed in on that browser for up to 30 days.

Please don't use your full legal name or anything sensitive as a display name unless you're happy for it to be shown publicly next to your contributions.

### What you contribute

Anything you add to a map is stored along with your display name and a timestamp. That covers maps, concepts (names, definitions, examples, quiz prompts, source links), relations, relation types and comments. We also keep an **activity log** of edits ("who changed what, and when") so contributions can be credited and reviewed.

### Technical information

- **IP address for rate limiting.** To slow down abuse, we count sign-in attempts per IP address over a short window. The address is stored in our database as part of a rate-limit counter and is used for nothing else.
- **Hosting logs.** Our hosting provider may keep standard server logs (for example IP address, browser type and the page requested) for security and reliability.

We don't use analytics, advertising trackers, social media pixels, fingerprinting or third-party embeds.

## What is public

- Your **display name** and **avatar colour** appear next to your edits, comments and activity.
- The [community page](/community) is visible to anyone, including people who aren't signed in. It shows totals, leading contributors by display name, and recent activity summaries.
- Maps and the concept dictionary are currently visible to signed-in users. Because anyone can sign in with a display name, treat anything you contribute as **public**.

## Why we use it

We use this information only to:

- run the service and keep you signed in;
- attribute contributions and show the history of each map;
- protect the service from spam and abuse;
- understand, at an aggregate level, how the atlas is growing (as shown on the community page).

Where data protection law requires a legal basis, we rely on our **legitimate interest** in running a collaborative, attributed knowledge space, and on the steps you take to use it.

## Who we share it with

We don't sell or rent personal information. It is processed by the services that host the app:

- **Vercel**, which hosts and serves the application;
- **Turso** (libSQL), which hosts the database.

Everything your browser loads, including our typefaces, is served from our own domain. **Your browser doesn't contact any third-party services while you use the site.** The documentation pages show when each guide was last edited. To get that date, our server asks GitHub's public API about the project's own repository. That request contains nothing about you.

We may disclose information if the law requires it.

## How long we keep it

- **Sessions** expire after 30 days, or straight away when you sign out.
- **Rate-limit counters** are short-lived and are overwritten as time windows roll over.
- **Your display name, contributions and activity history** are kept for as long as the atlas exists, because they're part of the shared record of each map. Other contributors may edit or remove content over time.

## Your choices and rights

Depending on where you live, you may have the right to access, correct or delete your personal information, or to object to how it is used. Because there's no email-based account, there's no self-service settings page yet. To make a request, [open an issue on GitHub](https://github.com/natesheehan/CC/issues) (please don't include anything sensitive in a public issue). We'll ask you to confirm the display name involved, and we'll do our best to help, for example by removing or anonymising your name on past contributions.

## Children

Concept Cartography isn't directed at children under 13, and we don't knowingly collect their information.

## Security

Session cookies are HTTP-only and never readable by scripts on the page, and traffic is served over HTTPS. Signing in by display name alone is deliberately lightweight, though: **anyone who types the same display name signs in as that user**. Don't rely on a display name as a secure identity.

## Changes to this policy

As the project develops we'll update this page and change the date at the top. Significant changes will also be noted in the project's history on GitHub.

## Contact

Questions about privacy? [Open an issue on GitHub](https://github.com/natesheehan/CC/issues).
