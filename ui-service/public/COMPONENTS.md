# UML Images Service - Component Library

This document outlines the reusable components and design system implemented in the UML Images Service v2.0.

## Design System

### CSS Custom Properties

Our design system is built on CSS custom properties (CSS variables) that provide:

- **Colors**: Semantic color palette with light/dark theme support
- **Typography**: Consistent font sizes, weights, and line heights
- **Spacing**: Uniform spacing scale (4px base unit)
- **Border Radius**: Consistent border radius values
- **Shadows**: Layered shadow system
- **Transitions**: Standardized animation timings

### Accessibility Features

- **WCAG 2.1 AA Compliance**: All components meet accessibility standards
- **Keyboard Navigation**: Full keyboard support with focus management
- **Screen Reader Support**: Proper ARIA labels and live regions
- **High Contrast Support**: Automatic detection and enhanced contrast
- **Reduced Motion**: Respects user's motion preferences

## Component Library

### 1. Button Component

**Classes**: `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-outline`, `.btn-ghost`

**Variants**:
- `btn-sm`: Small button
- `btn-lg`: Large button
- `btn-icon`: Icon-only button
- `btn-loading`: Loading state with spinner

**Accessibility**:
- Proper focus states
- Disabled state handling
- Screen reader announcements

### 2. Status Indicators

**Classes**: `.status`, `.status-badge`

**Types**:
- `status-loading`: Loading state with pulse animation
- `status-success`: Success state with green color
- `status-error`: Error state with red color
- `status-warning`: Warning state with amber color

### 3. Modal Components

**Fullscreen Modal**:
- Full viewport overlay
- Focus trapping
- Escape key handling
- Backdrop click to close

**Template Modal**:
- Grid-based template selection
- Keyboard navigation
- Search and filtering

### 4. Toast Notifications

**Features**:
- Automatic positioning
- Auto-dismiss timing
- Manual dismiss option
- Different types (success, error, warning, info)
- Accessible announcements

### 5. Form Components

**Editor Container**:
- Auto-resizing textarea
- Real-time statistics
- Syntax highlighting preparation
- Keyboard shortcuts support

### 6. Navigation Components

**Theme Toggle**:
- System preference detection
- Manual override capability
- Smooth transitions
- Icon state management

## Utility Classes

### Typography
- `.text-xs` to `.text-5xl`: Font size utilities
- `.font-light` to `.font-extrabold`: Font weight utilities
- `.text-left`, `.text-center`, `.text-right`: Text alignment

### Layout
- `.flex`, `.inline-flex`: Flexbox utilities
- `.items-*`, `.justify-*`: Flexbox alignment
- `.gap-*`: Gap utilities
- `.hidden`: Hide elements

### Interactive
- `.cursor-pointer`, `.cursor-not-allowed`: Cursor utilities
- `.select-none`, `.select-text`: Text selection
- `.pointer-events-none`: Disable pointer events

### Accessibility
- `.sr-only`: Screen reader only content
- `.focus-outline`: Enhanced focus styles
- `.focus-ring`: Focus ring utility

## Performance Optimizations

### 1. CSS Optimizations
- Critical CSS inlined
- Non-critical CSS loaded asynchronously
- CSS custom properties for runtime theming
- Efficient selector usage

### 2. JavaScript Optimizations
- Event delegation
- Debounced input handlers
- Lazy loading of non-critical features
- Service Worker caching

### 3. Image Optimizations
- WebP format support preparation
- Responsive image loading
- Lazy loading implementation ready
- Memory leak prevention (URL cleanup)

## Progressive Web App Features

### 1. Service Worker
- Offline functionality
- Background sync for failed requests
- Update notifications
- Asset caching strategy

### 2. Manifest
- App installation support
- Custom icons and splash screens
- Shortcuts for quick actions
- Protocol handlers

### 3. Offline Support
- Network status detection
- Graceful degradation
- Cached content serving
- Background synchronization

## Browser Support

### Modern Browsers
- Chrome 88+
- Firefox 85+
- Safari 14+
- Edge 88+

### Feature Detection
- CSS Grid with fallback
- Service Worker detection
- Clipboard API with fallback
- Touch events support

## Usage Examples

### Button Usage
```html
<button class="btn btn-primary btn-lg">
  <span aria-hidden="true">🚀</span>
  Generate Diagram
</button>
```

### Status Indicator
```html
<div class="status status-success" role="status" aria-live="polite">
  ✅ Diagram generated successfully
</div>
```

### Toast Notification
```javascript
umlService.showToast('Success', 'Operation completed', 'success');
```

### Theme Toggle
```html
<button id="themeToggle" class="theme-toggle" aria-label="Toggle dark mode">
  <span id="themeIcon" aria-hidden="true">🌙</span>
</button>
```

## Customization

### Theme Customization
Modify CSS custom properties in `:root` to customize the theme:

```css
:root {
  --color-primary-500: #your-color;
  --font-family-sans: 'Your-Font', sans-serif;
  --radius-lg: 12px;
}
```

### Component Customization
All components can be customized by overriding their CSS classes or extending with additional utility classes.

## Testing

### Accessibility Testing
- Automated testing with axe-core
- Manual keyboard navigation testing
- Screen reader testing
- Color contrast validation

### Performance Testing
- Core Web Vitals monitoring
- Lighthouse audits
- Bundle size analysis
- Runtime performance profiling

## Maintenance

### Adding New Components
1. Follow the established naming conventions
2. Include accessibility features by default
3. Add responsive design considerations
4. Document usage examples
5. Test across supported browsers

### Updating Existing Components
1. Maintain backward compatibility
2. Update documentation
3. Test accessibility impact
4. Validate performance impact
5. Update version numbers appropriately

---

This component library provides a solid foundation for building accessible, performant, and maintainable user interfaces while following modern web development best practices.