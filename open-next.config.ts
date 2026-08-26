import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// No ISR/static-regeneration pages in this app, so no incremental cache override is needed.
export default defineCloudflareConfig();
