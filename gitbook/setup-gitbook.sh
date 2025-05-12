#!/bin/bash

# Setup script for RunCache GitBook documentation

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "npm is not installed. Please install Node.js and npm first."
    exit 1
fi

# Install GitBook CLI
echo "Installing GitBook CLI..."
npm install -g gitbook-cli

# Initialize GitBook
echo "Initializing GitBook..."
gitbook init

# Install plugins
echo "Installing GitBook plugins..."
gitbook install

# Build the documentation
echo "Building documentation..."
gitbook build

# Success message
echo ""
echo "✅ GitBook documentation setup complete!"
echo ""
echo "To serve the documentation locally, run:"
echo "  cd gitbook && gitbook serve"
echo ""
echo "To build the documentation for production, run:"
echo "  cd gitbook && gitbook build"
echo ""
echo "The built documentation will be available in the '_book' directory." 