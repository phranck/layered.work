import type { APIRoute } from "astro";
import { searchResponse } from "../../search/response.js";
export const GET: APIRoute = ({ url }) => searchResponse("de", url);
