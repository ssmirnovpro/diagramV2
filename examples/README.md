# Diagram Examples

Working diagram examples for the web interface.

## How to Use

1. Open web interface: http://localhost:9002
2. Select diagram type from dropdown
3. Copy content from example file and paste into text field
4. Click "Generate Diagram"

## Available Examples

### PlantUML Diagrams

- **plantuml-sequence.txt** - Sequence diagram: authentication process
- **plantuml-simple.txt** - Simple communication diagram  
- **plantuml-class.txt** - Class diagram example
- **plantuml-beautiful.txt** - Beautiful sequence diagram with cache flow

### Graphviz DOT

- **dot-simple.txt** - Simple process flowchart
- **dot-graph.txt** - Layered architecture diagram
- **graphviz-beautiful.txt** - Beautiful process flow with error handling

## Supported Export Formats

- SVG (vector graphics) - recommended
- PNG (raster graphics)

## Tips

- Start with simple examples
- PlantUML doesn't require @startuml/@enduml - they are added automatically
- D2 diagrams support beautiful styles, colors, shapes, and grouping
- Use `direction: right` or `direction: down` to control layout in D2
- External icons are not supported by Kroki - use built-in shapes instead
- Graphviz is great for flowcharts and graphs

## Supported Diagram Types

✅ PlantUML  
✅ Graphviz (DOT)