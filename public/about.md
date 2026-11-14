---
title: About Pecking Order — a free, local-first tier list maker
description: Why Pecking Order exists, how it works without accounts or uploads, and how it is built.
url: https://pecking-order.pages.dev/about/
---

# A tier list maker that stays out of the way.

Pecking Order is a small, free tool for ranking things: films, snacks, programming languages, the bakeries on your street. Drop in pictures or names, drag them into tiers, and export a clean image for the group chat.

## Why it exists

Most tier list sites ask you to sign up, upload your pictures to their servers, and sit through ads while you work. Pecking Order does none of that. It is a static web page: once it has loaded, the work happens on your device. Your boards are saved in your browser's own storage, and nothing is sent anywhere unless you ask for it.

## How it is built

It is a React app written in TypeScript and bundled with Vite, served as plain files from Cloudflare Pages. Boards and images live in IndexedDB, the database built into your browser. When you search for a picture, your browser asks Wikipedia, Wikimedia Commons or Openverse directly. There is no Pecking Order server in the middle, because there is no Pecking Order server.

## Packs and credits

Category packs are community-made starter sets: a list of items, and where each item's picture lives on Wikipedia or Wikimedia Commons. Installing a pack downloads those pictures to your device once. Pictures found through search or packs keep their author and licence details, so credit goes where it is due.

## Open source

The code is MIT licensed and lives on [GitHub](https://github.com/KarthikSubramanian07/Pecking-Order). Bug reports, ideas and new packs are all welcome; the [contact page](https://pecking-order.pages.dev/contact.md) says where to send them. If it saved you an argument, you can [buy the developer a coffee](https://buymeacoffee.com/winnerkarthik).

The name is the joke. The rankings are serious.
