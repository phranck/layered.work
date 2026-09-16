# layered.work

The website at [layered.work](https://layered.work) and the editorial dashboard behind it. It replaces a Publii-generated static site with a database-backed one that can be edited from anywhere.

## What is being built

| Surface | Host | What it is |
| --- | --- | --- |
| Website | `layered.work` | Posts, project pages and a composed home page, in German and English |
| Dashboard | `dashboard.layered.work` | Where everything on the website is written and arranged |
| API | `api.layered.work` | What both of the above talk to |

The work is planned entirely in GitHub Issues on the `layered.work` project board. The epics carry the specifications, the sub-issues carry the steps.

## Repository layout

`apps/` holds the three surfaces and `packages/` holds what they share: the content language, the design tokens, the request schemas, the response headers and the component set.

`prototype/` holds the interactive design study that settles the visual language, the token system and the component set. It is not a dependency and it does not ship, and it runs on its own:

```bash
python3 prototype/serve.py
```

`docs/reference/` holds documents kept from two earlier attempts at this project, for the decisions recorded in them rather than for their code.

## Content

Content is Markdown with a component syntax modelled on SwiftUI, so that an author composes a page from the same components the site is built from. One register defines every component, and the parser, the renderer, the editor's completion, its highlighting and its validation all read from it.

[The language reference](docs/content-language.md) says what can be written. It is generated from that register, so it cannot promise anything the parser refuses.

## Hosting

Zerops, in the `LAYERED` organisation. `zerops-project-import.yml` describes the project and its services, `zerops.yml` describes how each service is built and run.

## License

Private. Not published under any licence.
