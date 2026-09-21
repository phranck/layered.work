/// <reference types="astro/client" />

declare namespace App {
  /**
   * What the middleware puts on every request for a page to read.
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
  }
}
