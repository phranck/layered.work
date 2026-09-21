# Icon notices

## Brand marks

The eight SVGs in `brands/` are unmodified files from Simple Icons 15.16.0. Five stand for the configured social accounts:

- `mastodon.svg`: <https://raw.githubusercontent.com/simple-icons/simple-icons/15.16.0/icons/mastodon.svg>
- `github.svg`: <https://raw.githubusercontent.com/simple-icons/simple-icons/15.16.0/icons/github.svg>
- `youtube.svg`: <https://raw.githubusercontent.com/simple-icons/simple-icons/15.16.0/icons/youtube.svg>
- `instagram.svg`: <https://raw.githubusercontent.com/simple-icons/simple-icons/15.16.0/icons/instagram.svg>
- `xing.svg`: <https://raw.githubusercontent.com/simple-icons/simple-icons/15.16.0/icons/xing.svg>

Three stand for the languages a code block names in its toolbar:

- `swift.svg`: <https://raw.githubusercontent.com/simple-icons/simple-icons/15.16.0/icons/swift.svg>
- `gnubash.svg`: <https://raw.githubusercontent.com/simple-icons/simple-icons/15.16.0/icons/gnubash.svg>
- `html5.svg`: <https://raw.githubusercontent.com/simple-icons/simple-icons/15.16.0/icons/html5.svg>

Simple Icons is released under CC0 1.0 Universal. The complete licence text from the pinned release is stored in [`icon-licenses/Simple-Icons-CC0-1.0.txt`](icon-licenses/Simple-Icons-CC0-1.0.txt) and comes from <https://raw.githubusercontent.com/simple-icons/simple-icons/15.16.0/LICENSE.md>.

The licences of individual brand owners may also apply to their marks. Inclusion here does not imply endorsement by those owners.

## Interface icons

The interface uses `@phosphor-icons/react` 2.1.10 from <https://github.com/phosphor-icons/react/tree/v2.1.10>. Phosphor Icons is released under the MIT License. The complete licence text from the pinned tag is stored in [`icon-licenses/Phosphor-Icons-MIT-2.1.10.txt`](icon-licenses/Phosphor-Icons-MIT-2.1.10.txt) and comes from <https://raw.githubusercontent.com/phosphor-icons/react/v2.1.10/LICENSE>.

## Adding a brand mark

1. Confirm what the mark is for. A social account is configured (the original list is `SOCIAL_ACCOUNTS` in the prototype); a language mark is one a code block actually names. Check the brand owner's current usage rules either way.
2. Choose and record a pinned Simple Icons release. Download the original `icons/<slug>.svg` from that tag directly into `packages/ui/assets/brands/`; do not edit or optimise it.
3. Add the pinned source URL above. If the release or licence changes, store its complete licence text in `icon-licenses/` and update this notice.
4. Add the slug to `BrandName` in `packages/ui/src/brand-mark.tsx` and its static mask rule in `brand-mark.css`. A language mark also needs its entry in `LANGUAGE_BRANDS` in `code-block.tsx`.
5. Add the exact filename to `apps/dashboard/build.test.mjs`, then run the dashboard build test.
