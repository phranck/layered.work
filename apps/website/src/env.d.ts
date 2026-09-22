/// <reference types="astro/client" />

declare namespace App {
  /**
   * What the middleware puts on every request for a page to read, and the one
   * thing a page puts back for the middleware to read.
   */
  interface Locals {
    /**
     * The value naming this response's own inline elements.
     *
     * Any page that writes an inline `<script>` or `<style>` puts it on that
     * element. Without it the element does not run, because the content policy
     * permits inline by nonce rather than by `unsafe-inline`.
     */
    nonce: string;
    siteVisible: boolean;
    /**
     * Whether this page draws a three-dimensional model.
     *
     * Set by the page whilst it renders and read by the middleware once the
     * response exists, because it decides one directive in the content policy.
     * The page is the only place that knows: the answer is in its body, which
     * nothing has looked at when the request arrives.
     */
    rendersModel: boolean;
  }
}
