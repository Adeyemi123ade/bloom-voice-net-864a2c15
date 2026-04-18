import { forwardRef } from "react";

type Props = {
  localPreviewRef: React.RefObject<HTMLDivElement>;
};

const RemoteVideo = forwardRef<HTMLDivElement, Props>(({ localPreviewRef }, ref) => {
  return (
    <div className="mx-6 mt-2 flex-1 rounded-2xl bg-black/40 border border-border relative overflow-hidden">
      <div ref={ref} className="absolute inset-0" />
      <div
        ref={localPreviewRef}
        className="absolute bottom-2 right-2 w-20 h-28 rounded-lg bg-secondary border border-border overflow-hidden"
      />
    </div>
  );
});

RemoteVideo.displayName = "RemoteVideo";
export default RemoteVideo;
