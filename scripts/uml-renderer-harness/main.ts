import {
	renderPlantUmlInBrowser,
	cancelPlantUmlRendering
} from '../../src/lib/visualizations/post-to-uml/plantuml/browser';
import { PLANTUML_REPRESENTATIVE_FIXTURES } from '../../src/lib/visualizations/post-to-uml/plantuml/fixtures';
Object.assign(window, {
	umlHarness: {
		render: renderPlantUmlInBrowser,
		cancel: cancelPlantUmlRendering,
		fixtures: PLANTUML_REPRESENTATIVE_FIXTURES
	}
});
