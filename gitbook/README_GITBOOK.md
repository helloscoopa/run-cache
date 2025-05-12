# RunCache Documentation

This directory contains the GitBook documentation for the RunCache project. The documentation is structured to provide comprehensive information about the library's features, API, and usage patterns.

## Structure

The documentation is organized into the following sections:

- **Getting Started**: Installation and basic usage guides
- **Core Features**: Documentation for fundamental features
- **Advanced Features**: Documentation for more complex features
- **API Reference**: Detailed API documentation
- **Guides**: Best practices and optimization tips
- **Resources**: FAQ and additional resources

## Using with GitBook

To use this documentation with GitBook:

1. Install GitBook CLI (if you haven't already):
   ```bash
   npm install -g gitbook-cli
   ```

2. Navigate to the gitbook directory:
   ```bash
   cd gitbook
   ```

3. Initialize GitBook:
   ```bash
   gitbook init
   ```

4. Serve the documentation locally:
   ```bash
   gitbook serve
   ```

5. Build the documentation for production:
   ```bash
   gitbook build
   ```

## Customization

You can customize the GitBook configuration by editing the `book.json` file. For example:

```json
{
  "title": "RunCache Documentation",
  "description": "Documentation for the RunCache library",
  "author": "Your Name",
  "plugins": ["search", "github", "edit-link"],
  "pluginsConfig": {
    "github": {
      "url": "https://github.com/helloscoopa/run-cache"
    },
    "edit-link": {
      "base": "https://github.com/helloscoopa/run-cache/edit/main/gitbook",
      "label": "Edit This Page"
    }
  }
}
```

## Contributing

To contribute to the documentation:

1. Fork the repository
2. Make your changes
3. Submit a pull request

Please ensure your documentation is clear, concise, and includes examples where appropriate.

## License

The documentation is licensed under the same MIT license as the RunCache project. 