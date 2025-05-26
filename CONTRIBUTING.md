# Contributing to Obsidian Custom Sync Plugin

Thank you for your interest in contributing to the Obsidian Custom Sync Plugin!

## Development Setup

1. Clone this repository
2. Install dependencies: `npm install`
3. Build the plugin: `npm run build`
4. Link the plugin to your Obsidian vault for testing

## Building

```bash
npm run dev    # Build and watch for changes
npm run build  # Build for production
```

## Code Style

- Use TypeScript for all new code
- Follow the existing code style
- Add types for all function parameters and return values

## Submitting Changes

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes
4. Push to your fork
5. Create a Pull Request

## Testing

- Test your changes with both desktop and mobile versions of Obsidian
- Ensure sync functionality works correctly
- Test error handling scenarios

## Server Development

The companion server code can be found in the `server` directory (if included) or as a separate repository.