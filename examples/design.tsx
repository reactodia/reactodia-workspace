import * as React from 'react';
import * as N3 from 'n3';

import * as Reactodia from '../src/workspace';

import { mountOnLoad } from './resources/common';

import './design.css';

function DesignExample() {
    return (
        <div className='design-overrides'>
            <Reactodia.Workspace>
                <Reactodia.WorkspaceRoot>
                    <section>
                        <h2>Colors</h2>
                        <h3>Grays</h3>
                        <p>
                            <div className='design-boxes'>
                                <div style={{background: 'var(--reactodia-color-gray-0)'}} />
                                <div style={{background: 'var(--reactodia-color-gray-100)'}} />
                                <div style={{background: 'var(--reactodia-color-gray-200)'}} />
                                <div style={{background: 'var(--reactodia-color-gray-300)'}} />
                                <div style={{background: 'var(--reactodia-color-gray-400)'}} />
                                <div style={{background: 'var(--reactodia-color-gray-500)'}} />
                                <div style={{background: 'var(--reactodia-color-gray-600)'}} />
                                <div style={{background: 'var(--reactodia-color-gray-700)'}} />
                                <div style={{background: 'var(--reactodia-color-gray-800)'}} />
                                <div style={{background: 'var(--reactodia-color-gray-900)'}} />
                                <div style={{background: 'var(--reactodia-color-gray-1000)'}} />
                            </div>
                        </p>
                        <h3>Emphasis</h3>
                        <p>
                            <div className='design-boxes'>
                                <div style={{background: 'var(--reactodia-color-emphasis-0)'}} />
                                <div style={{background: 'var(--reactodia-color-emphasis-100)'}} />
                                <div style={{background: 'var(--reactodia-color-emphasis-200)'}} />
                                <div style={{background: 'var(--reactodia-color-emphasis-300)'}} />
                                <div style={{background: 'var(--reactodia-color-emphasis-400)'}} />
                                <div style={{background: 'var(--reactodia-color-emphasis-500)'}} />
                                <div style={{background: 'var(--reactodia-color-emphasis-600)'}} />
                                <div style={{background: 'var(--reactodia-color-emphasis-700)'}} />
                                <div style={{background: 'var(--reactodia-color-emphasis-800)'}} />
                                <div style={{background: 'var(--reactodia-color-emphasis-900)'}} />
                                <div style={{background: 'var(--reactodia-color-emphasis-1000)'}} />
                            </div>
                        </p>
                        <h3>Other (primary, secondary, success, info, warning, danger)</h3>
                        <p>
                            <div className='design-boxes'>
                                <div style={{background: 'var(--reactodia-color-primary)'}} />
                                <div style={{background: 'var(--reactodia-color-secondary)'}} />
                                <div style={{background: 'var(--reactodia-color-success)'}} />
                                <div style={{background: 'var(--reactodia-color-info)'}} />
                                <div style={{background: 'var(--reactodia-color-warning)'}} />
                                <div style={{background: 'var(--reactodia-color-danger)'}} />
                            </div>
                        </p>
                    </section>
                </Reactodia.WorkspaceRoot>
            </Reactodia.Workspace>
        </div>
    );
}

mountOnLoad(<DesignExample />);
