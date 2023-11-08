import * as React from 'react';
import * as N3 from 'n3';

import {
    Workspace, DefaultWorkspace, RdfDataProvider, ElementIri, layoutForcePadded,
} from '../src/index';

import { mountOnLoad, tryLoadLayoutFromLocalStorage, saveLayoutToLocalStorage } from './resources/common';

const EXAMPLE = `@prefix fts: <https://w3id.org/datafabric.cc/ontologies/fts#> .
 @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
 @prefix ex: <http://example.com/> .

 ex:LED-1 a fts:C4_Legal_Entity_Details ;
    fts:p80_describes_company ex:LE-1 ;
    fts:p81_includes_le_reg_entity ex:LE-1-NameEntity-1157847449121,
        ex:LE-1-Address-1157847449121,
        ex:LE-1-RegInfo-1157847449121 .
 ex:LE-1-NameEntity-1157847449121 a fts:C38_Name_Entity ;
    fts:p82_refers_to_company ex:LE-1 ;
    fts:p76_entered_on_registry_with ex:RND-1157847449121 ;
    fts:p16_full_name "ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ \\"ДАТАФАБРИК\\""@ru ;
    fts:p17_short_name "ООО \\"ДАТАФАБРИК\\""@ru .
 ex:LE-1-Address-1157847449121 a fts:C39_Address_Entity ;
    fts:p82_refers_to_company ex:LE-1 ;
    fts:p76_entered_on_registry_with ex:RND-1157847449121 ;
    fts:p18_postcode "193231" ;
    fts:p21_block "КОРПУС 2" ;
    fts:p23_office_number "КВАРТИРА 83" ;
    fts:p20_address_code "780000000000684" ;
    fts:p22_building_number "ДОМ 11" ;
    fts:p98_located_at ex:Region-78 ;
    fts:p98_located_at ex:Street-1 .
 ex:LE-1-RegInfo-1157847449121 a fts:C41_LE_Registration_Entity ;
    fts:p82_refers_to_company ex:LE-1 ;
    fts:p76_entered_on_registry_with ex:RND-1157847449121 ;
    fts:p28_le_primary_state_registration_number "1157847449121" ;
    fts:p29_psrn_assignment_date "25-12-2015"^^xsd:date .
`;

const DIAGRAM =
`@prefix fts: <https://w3id.org/datafabric.cc/ontologies/fts#> .
 @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
 @prefix ex: <http://example.com/> .

 ex:LED-1 a fts:C4_Legal_Entity_Details ;
    fts:p80_describes_company ex:LE-1 ;
    fts:p81_includes_le_reg_entity ex:LE-1-NameEntity-1157847449121,
        ex:LE-1-Address-1157847449121,
        ex:LE-1-RegInfo-1157847449121 .`;

function TurtleGraphExample() {
    const workspaceRef = React.useRef<Workspace | null>(null);

    React.useEffect(() => {
        const cancellation = new AbortController();
        const {model, view, performLayout} = workspaceRef.current!.getContext();

        const parser = new N3.Parser();
        const dataProvider = new RdfDataProvider();
        dataProvider.addGraph(parser.parse(EXAMPLE));
    
        const diagram = tryLoadLayoutFromLocalStorage();
        if (diagram) {
            model.importLayout({
                diagram,
                dataProvider,
                validateLinks: true,
                signal: cancellation.signal,
            });
        } else {
            model.createNewDiagram({dataProvider}).then(async () => {
                const elementIris = new Set<ElementIri>();
                const parsedDiagram = parser.parse(DIAGRAM);
                for (const {subject, object} of parsedDiagram) {
                    if (subject.termType === 'NamedNode') {
                        elementIris.add(subject.value as ElementIri);
                    }
                    if (object.termType === 'NamedNode') {
                        elementIris.add(object.value as ElementIri);
                    }
                }
                for (const iri of elementIris) {
                    model.createElement(iri);
                }
                await Promise.all([
                    model.requestElementData(Array.from(elementIris)),
                    model.requestLinksOfType(),
                ]);
                const canvas = view.findAnyCanvas();
                if (canvas) {
                    canvas.renderingState.syncUpdate();
                    await performLayout({
                        canvas,
                        layoutFunction: layoutForcePadded,
                        signal: cancellation.signal,
                    });
                }
            });
        }
        return () => cancellation.abort();
    }, []);

    return (
        <Workspace ref={workspaceRef}>
            <DefaultWorkspace
                toolbar={{
                    onSaveDiagram: () => {
                        const {model} = workspaceRef.current!.getContext();
                        const diagram = model.exportLayout();
                        window.location.hash = saveLayoutToLocalStorage(diagram);
                        window.location.reload();
                    },
                }}
            />
        </Workspace>
    );
}

mountOnLoad(<TurtleGraphExample />);
