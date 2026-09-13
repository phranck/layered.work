# layered.work

Project instructions. Everything in the global `~/.claude/CLAUDE.md` and `~/.claude/rules/*` stays in force; this file adds what is true of this project alone.

## What this is

A website and an editorial dashboard replacing a Publii-generated static site. Three surfaces on three hosts: `layered.work`, `dashboard.layered.work`, `api.layered.work`. Hosted on Zerops in the `LAYERED` organisation.

## Where the plan lives

GitHub Issues and the `layered.work` project board, and nowhere else. Each epic carries a specification, each sub-issue carries one step with its own acceptance criteria. Read the issue and its parent epic before touching a file, per the global issue-first rule.

## Design

`prototype/` is the design study that settles the visual language. It is not a dependency and it does not ship, but `prototype/tokens/` and `prototype/ui/` are written to be moved into the real packages unchanged. When the built product and the prototype disagree about a value, the product is wrong until somebody decides otherwise.

The `web-app-ui` skill governs everything visual. Icons are Phosphor for the interface and Simple Icons for brand marks, decided for this project.

## Language

The site is bilingual. English entries keep the paths they have today, so every URL that exists now survives without a redirect. German entries live under `/de/`. Everything created from now on carries its language prefix, `/en/` or `/de/`, whichever it is.

The dashboard interface is German or English, chosen in the account and applied without a reload.

## Content

Markdown with a SwiftUI-shaped component syntax. One register defines every component, and the parser, the renderer, the editor and the validator all read from it. Nothing about a component is written down twice.

## Verification

`evidence-first.md` applies without exception, and the visual half of it is not optional here: a layout claim is a measurement, not a screenshot.
