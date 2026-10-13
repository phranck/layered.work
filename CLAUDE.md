# layered.work

Project instructions. Everything in the global `~/.claude/CLAUDE.md` and `~/.claude/rules/*` stays in force; this file adds what is true of this project alone.

## What this is

A website and an editorial dashboard replacing a Publii-generated static site. It is hosted on Zerops in the `LAYERED` organization. The `website` service answers on `layered.work`, which shows the countdown until the launch, and on `new.layered.work`, which shows the finished site. The dashboard answers on `dashboard.layered.work`. The API has no public name, and `docs/hosting.md` says why.

## Where the plan lives

GitHub Issues and the `layered.work` project board, and nowhere else. Each epic carries a specification, each sub-issue carries one step with its own acceptance criteria. Read the issue and its parent epic before touching a file, per the global issue-first rule.

## Design

`prototype/` is the design study of the visual language. It is not a dependency and it does not ship. It links the product's fonts, tokens and component styles from `packages/` and keeps no copy of them, so it cannot show those differently from the product. Its own files hold its views, the site's and the dashboard's compositions it draws them with, and what only the prototype has, such as its view switcher.

**Every design change made in the product reaches the prototype in the same change**, whether phranck asked for it or a fix needed it. The two never disagree, so the prototype can always be followed as it stands. phranck decided this on 13 October 2026, after following the mockup had undone two of his decisions: "Einfacher waere es, du passt das Mockup dynamisch an, wenn es Anpassungen gibt."

The `web-app-ui` skill governs everything visual. Icons are Phosphor for the interface and Simple Icons for brand marks, decided for this project. Phosphor icons are duotone and nothing else, which `packages/ui/src/icons.ts` enforces: take icons from there, where any other weight is a type error. phranck decided this on 2 October 2026.

A card's header and footer are a shade darker than its body, on every surface. phranck chose darker over lighter on 2 October 2026, after seeing both side by side.

## Language

The site is bilingual. English entries keep the paths they have today, so every URL that exists now survives without a redirect. German entries live under `/de/`. Everything created from now on carries its language prefix, `/en/` or `/de/`, whichever it is.

The dashboard interface is German or English, chosen in the account and applied without a reload.

## Content

Markdown with a SwiftUI-shaped component syntax. One register defines every component, and the parser, the renderer, the editor and the validator all read from it. Nothing about a component is written down twice.

`docs/content-language.md` is the reference, generated from that register by the content package's build. Change the register, not the document.

## Verification

`evidence-first.md` applies without exception, and the visual half of it is not optional here: a layout claim is a measurement, not a screenshot.
