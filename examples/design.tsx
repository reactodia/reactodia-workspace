import * as React from 'react';
import * as N3 from 'n3';

import * as Reactodia from '../src/workspace';

import { mountOnLoad } from './resources/common';

import './design.css';

function DesignExample() {
    return (
        <div className='design-example'>
            <Reactodia.Workspace>
                <Reactodia.WorkspaceRoot>
                    <section>
                        <h2>Colors</h2>
                        <h3>Grays</h3>
                        <p>
                            <ColorBoxes
                                colors={Array.from(
                                    {length: 11},
                                    (_, i) => `var(--reactodia-color-gray-${i * 100})`)
                                }
                            />
                        </p>
                        <h3>Emphasis</h3>
                        <p>
                            <ColorBoxes
                                colors={Array.from(
                                    {length: 11},
                                    (_, i) => `var(--reactodia-color-emphasis-${i * 100})`)
                                }
                            />
                        </p>
                        <h3>Primary, secondary, success, info, warning, danger</h3>
                        <p>
                            {['primary', 'secondary', 'success', 'info', 'warning', 'danger'].map(type =>
                                <ColorBoxes key={type}
                                    colors={[
                                        `var(--reactodia-color-${type}-lightest`,
                                        `var(--reactodia-color-${type}-lighter`,
                                        `var(--reactodia-color-${type}-light`,
                                        `var(--reactodia-color-${type}`,
                                        `var(--reactodia-color-${type}-dark`,
                                        `var(--reactodia-color-${type}-darker`,
                                        `var(--reactodia-color-${type}-darkest`,
                                        `var(--reactodia-color-${type}-contrast-background`,
                                        `var(--reactodia-color-${type}-contrast-foreground`,
                                    ]}
                                />
                            )}
                        </p>
                    </section>
                </Reactodia.WorkspaceRoot>
            </Reactodia.Workspace>
        </div>
    );
}

function ColorBoxes(props: { colors: readonly string[] }) {
    const {colors} = props;
    return (
        <div className='design-boxes'>
            {colors.map(color => <div key={color} style={{background: color}} />)}
        </div>
    );
}

mountOnLoad(<DesignExample />);
