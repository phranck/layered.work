import type { APIRoute } from "astro";
import { rssFeed } from "../content/feeds.js";
import { contentResponse } from "../content/response.js";
export const GET: APIRoute = () => contentResponse("application/rss+xml; charset=utf-8", rssFeed);
