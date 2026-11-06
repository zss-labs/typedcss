import { renderToStaticMarkup } from 'react-dom/server';
import { Accent, Card, overrides } from './fixture/Card';

// Rendering with the transformer in place: sx on host elements becomes
// className and style, and a component receives sx as a value to merge.
describe('@typedcss/swc-jest', () => {
  it('turns sx into class names', () => {
    const html = renderToStaticMarkup(<Card>plain</Card>);
    expect(html).toMatch(
      /^<div class="x[a-z0-9]{7}( x[a-z0-9]{7}){2}">plain<\/div>$/,
    );
  });

  it('lets a caller override a component through sx', () => {
    const plain = renderToStaticMarkup(<Card>a</Card>)
      .match(/class="([^"]+)"/)![1]
      .split(' ');
    const over = renderToStaticMarkup(<Card sx={overrides.danger}>a</Card>)
      .match(/class="([^"]+)"/)![1]
      .split(' ');
    // the background class is replaced, padding and color stay
    expect(over).toHaveLength(3);
    expect(over.filter((name) => plain.includes(name))).toHaveLength(2);
  });

  it('passes dynamic values through style', () => {
    const html = renderToStaticMarkup(<Accent width={240} />);
    expect(html).toMatch(/style="--x[a-z0-9]{7}-value:240px"/);
  });
});
