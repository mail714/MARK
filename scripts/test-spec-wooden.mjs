// Verify the new wooden-stain rule on a wooden proof.
// Run: npx tsx --env-file=.env.local scripts/test-spec-wooden.mjs

import { extractSpecWithClaude } from '../lib/ai/spec-extractor.ts';

const proofText = `Wooden Honours Board
Quantity: 1 No.
Size: 1200 x 1200mm
Material: Light Oak faced MDF with solid Oak frame.
Frame: 44mm
Stain: Stain 1
Grain Direction: Grain direction will be as chosen by the production team.
Fixings: Brass mirror fixings
Graphics: Matt Cut Vinyl graphics applied to face of board.
Logo: Digitally printed onto white vinyl and applied to the face`;

const spec = await extractSpecWithClaude({ proofText, salesOrderText: null });
console.log(JSON.stringify(spec, null, 2));
