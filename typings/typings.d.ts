// placeholders for webcola
declare module 'd3-dispatch';
declare module 'd3-timer';
declare module 'd3-drag';

declare module '*.resource.svg' {
    const imageUrl: string;
    export default imageUrl;
}

declare module '*.inline.svg' {
    const imageUrl: string;
    export default imageUrl;
}

declare module '*.module.css' {
    const classes: Record<string, string>;
    export default classes;
}
