import MobileFrame from "@/components/MobileFrame";

export default function Home() {
  return (
    <MobileFrame>
      <div className="h-full w-full flex flex-col px-6 pt-14">
        <h1 className="text-[22px] font-bold text-foreground">Chats</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Your conversations will appear here.
        </p>
      </div>
    </MobileFrame>
  );
}
