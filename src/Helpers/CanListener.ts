/*
    this helper method will listen to rust for can detection events and provide updates accordingly.

    will return the number of cans per column.
*/

// received from rust invoke. this is ONE column of cans
type CanCol = {
    column: number;
}
type CanCount = CanCol[];

// there should be a planogram here received from the cad backend. dont know the structure yet...

// the plaogram should be mapped to the cans map and then identify which cans are in the correct positions

// so planogram says coke is in column 1, we should check if the detected cans match this arrangement
    // - if 5 cans in col 1 we can safely assume these cans are coke. this depends if set up correctly

// will code the stuff soon