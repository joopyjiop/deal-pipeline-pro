# Perplexity CLI

Agent guidance for `pplx`, vendored for Deal Pipeline Pro from the documented behavior of [joopyjiop/perplexity-cli](https://github.com/joopyjiop/perplexity-cli) and the upstream Perplexity agent-skill reference.

This pack does not vendor the native binary, install it automatically, or add a runtime dependency. It teaches an agent or owner how to use Perplexity for grounded public-source discovery and page snippets before handing reviewed URLs to the existing Camofox evidence crawler.

Contents:

- `SKILL.md` — installation, authentication, search/snippet usage, pitfalls, and Deal Pipeline Pro safety rules

Required credential when using the CLI:

- `PERPLEXITY_API_KEY` with a `pplx-...` value, or an interactive `pplx auth login`

Keep the credential outside the repository and out of browser code.
