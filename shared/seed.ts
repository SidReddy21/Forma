import * as Y from 'yjs';
import { addNode, metadataOf, type CanvasNode } from './canvas';

export function seedDocument(doc: Y.Doc, empty = false) {
  doc.transact(() => {
    metadataOf(doc).set('name', empty ? 'Untitled canvas' : 'Studies in shape');
    metadataOf(doc).set('background', '#edeff1');
    metadataOf(doc).set('schema', '1');
    if (empty) return;
    const add = (props: Partial<CanvasNode> & { type: CanvasNode['type'] }) => addNode(doc, props);
    const frame = add({
      id: 'field-notes',
      type: 'frame',
      name: '01 / Field notes',
      x: 80,
      y: 80,
      width: 560,
      height: 740,
      fill: '#f9faf7',
    });
    const child = (props: Partial<CanvasNode> & { type: CanvasNode['type'] }) =>
      add({ parentId: frame, ...props });
    child({
      type: 'text',
      name: 'Edition',
      x: 116,
      y: 115,
      width: 490,
      height: 20,
      text: 'FORM & FIELD                                      VOL. 001 / 2026',
      fontSize: 11,
      fill: '#252d29',
      bold: true,
    });
    child({
      type: 'text',
      name: 'Field notes',
      x: 112,
      y: 166,
      width: 500,
      height: 174,
      text: 'FIELD\nNOTES',
      fontSize: 88,
      bold: true,
      fill: '#20372e',
    });
    child({
      type: 'ellipse',
      name: 'Mint disc',
      x: 183,
      y: 358,
      width: 350,
      height: 350,
      fill: '#b9e8d3',
    });
    for (let i = 0; i < 9; i++)
      child({
        type: 'rectangle',
        name: `Forest stripe ${i + 1}`,
        x: 171 + i * 34,
        y: 385 + Math.abs(i - 4) * 12,
        width: 15,
        height: 268 - Math.abs(i - 4) * 24,
        fill: '#254f3f',
        radius: 8,
        rotation: -22,
      });
    child({
      type: 'ellipse',
      name: 'Coral sun',
      x: 439,
      y: 360,
      width: 100,
      height: 100,
      fill: '#f38f78',
    });
    child({
      type: 'line',
      name: 'Footer rule',
      x: 116,
      y: 746,
      width: 488,
      height: 0,
      stroke: '#a3afa5',
      strokeWidth: 1,
    });
    child({
      type: 'text',
      name: 'Caption',
      x: 116,
      y: 764,
      width: 360,
      height: 30,
      text: 'An ongoing exploration of the everyday.',
      fontSize: 12,
      fill: '#425347',
    });
    child({
      type: 'text',
      name: 'Page number',
      x: 573,
      y: 762,
      width: 30,
      height: 24,
      text: '01',
      fontSize: 14,
      bold: true,
      fill: '#254f3f',
    });
    const second = add({
      id: 'shape-study',
      type: 'frame',
      name: '02 / A different perspective',
      x: 710,
      y: 80,
      width: 350,
      height: 465,
      fill: '#dad6ef',
    });
    add({
      parentId: second,
      type: 'text',
      name: 'Study label',
      x: 738,
      y: 108,
      width: 290,
      height: 22,
      text: 'A DIFFERENT PERSPECTIVE                       02',
      fontSize: 9,
      bold: true,
      fill: '#45415a',
    });
    add({
      parentId: second,
      type: 'text',
      name: 'Shape of things',
      x: 735,
      y: 152,
      width: 310,
      height: 165,
      text: 'Shape\nof things.',
      fontSize: 58,
      bold: true,
      fill: '#3d3455',
    });
    add({
      parentId: second,
      type: 'ellipse',
      name: 'Dark circle',
      x: 772,
      y: 330,
      width: 175,
      height: 175,
      fill: '#514366',
    });
    add({
      parentId: second,
      type: 'rectangle',
      name: 'Apricot block',
      x: 876,
      y: 348,
      width: 132,
      height: 132,
      fill: '#ffbda5',
      radius: 3,
      rotation: 15,
    });
    add({
      parentId: second,
      type: 'ellipse',
      name: 'Lilac circle',
      x: 885,
      y: 384,
      width: 65,
      height: 65,
      fill: '#dad6ef',
    });
    const palette = add({
      id: 'color-study',
      type: 'group',
      name: 'Palette / Soft contrast',
      x: 710,
      y: 602,
      width: 350,
      height: 160,
      fill: 'transparent',
    });
    add({
      parentId: palette,
      type: 'text',
      name: 'Palette title',
      x: 710,
      y: 606,
      width: 350,
      height: 24,
      text: 'SOFT CONTRAST',
      fontSize: 10,
      bold: true,
      fill: '#67716d',
    });
    ['#254f3f', '#b9e8d3', '#f38f78', '#dad6ef', '#514366'].forEach((fill, i) => {
      add({
        parentId: palette,
        type: 'rectangle',
        name: fill,
        x: 710 + i * 70,
        y: 641,
        width: 64,
        height: 66,
        fill,
        radius: 4,
      });
      add({
        parentId: palette,
        type: 'text',
        name: 'Color value',
        x: 710 + i * 70,
        y: 719,
        width: 69,
        height: 16,
        text: fill.slice(1).toUpperCase(),
        fontSize: 9,
        fill: '#747c79',
      });
    });
  }, 'seed');
}
