import { forwardRef, type ImgHTMLAttributes } from "react";

type ImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  priority?: boolean;
};

const Image = forwardRef<HTMLImageElement, ImageProps>(function Image(
  { priority, loading, ...props },
  ref,
) {
  return (
    <img
      {...props}
      ref={ref}
      loading={priority ? "eager" : (loading ?? "lazy")}
      decoding="async"
    />
  );
});

export default Image;
