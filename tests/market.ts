import { TestFixture } from "./utils";
import { testInitializeController } from "./admin-actions/initialize-controller";
import { testCreateMarket } from "./admin-actions/create-market";
import { ControllerFixture } from "./fixtures/controller";
import { MarketFixture } from "./fixtures/market";

describe("Market", () => {
  let fixture: TestFixture;
  let controller: ControllerFixture;
  let market: MarketFixture;

  before(async () => {
    fixture = await TestFixture.setup();
  });

  it("should initialize controller", async () => {
    controller = await testInitializeController(
      fixture.program,
      fixture.provider,
      fixture.authority.publicKey
    );
  });

  it("should create a market", async () => {
    market = await testCreateMarket(fixture, controller);
  });

  // Add more test cases as needed
});