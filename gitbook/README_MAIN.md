# RunCache GitBook Documentation

This directory contains the GitBook documentation for the RunCache project. The documentation is designed to be comprehensive and user-friendly, covering all aspects of the library.

## Directory Structure

```
gitbook/
├── README.md                # Introduction page
├── SUMMARY.md               # Table of contents
├── book.json                # GitBook configuration
├── getting-started/         # Getting started guides
├── features/               # Core features documentation
├── advanced/               # Advanced features documentation
├── api/                    # API reference
├── guides/                 # Best practices and guides
├── resources/              # FAQ and resources
└── styles/                 # Custom CSS styles
```

## Setting Up the Documentation

To set up and serve the GitBook documentation:

1. Make sure you have Node.js and npm installed
2. Run the setup script:
   ```bash
   ./setup-gitbook.sh
   ```
   
   Or manually:
   ```bash
   npm install -g gitbook-cli
   cd gitbook
   gitbook install
   gitbook serve
   ```

3. Open your browser and navigate to `http://localhost:4000` to view the documentation

## Building for Production

To build the documentation for production:

```bash
cd gitbook
gitbook build
```

The built documentation will be available in the `_book` directory.

## Contributing to the Documentation

Contributions to the documentation are welcome! Please follow these guidelines:

1. Make sure your changes are accurate and well-written
2. Follow the existing style and structure
3. Add examples where appropriate
4. Test any code examples to ensure they work correctly

## License

The documentation is licensed under the MIT License, the same as the RunCache project itself. 