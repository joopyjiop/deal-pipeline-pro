# Official n8n workflow guidance

Vendored for Deal Pipeline Pro from [n8n-io/skills](https://github.com/n8n-io/skills), the official n8n skills repository.

This project-specific pack applies the official n8n patterns to the recurring lead-sourcing workflow:

- scheduled, bounded source batches;
- Loop Over Items with deliberate pacing;
- retry and error branches that do not hide failures;
- persistent deduplication/run state;
- server-side credential handling;
- reusable sub-workflows for source processing.

The upstream repository is the source of truth for n8n node behavior. This local guidance does not include credentials, an n8n MCP connection, or a scraper bypass.
