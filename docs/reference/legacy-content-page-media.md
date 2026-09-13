# Content Page Media Ownership

Content page assets are links from `content_assets` to global `media_assets`.

When a content page slug changes, the page row and all page-owned content asset links are updated in
one database transaction. If either update fails, both changes roll back.

When a content page is deleted, only the page-owned `content_assets` links are deleted. Global
`media_assets` rows and stored media files remain available in the media library so assets reused by
other content are not removed implicitly.
